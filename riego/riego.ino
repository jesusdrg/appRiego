/**
 * ESP32 Irrigation System Firmware — BLE GATT + Multi-Zone
 *
 * Transport : NimBLE-Arduino (GATT, two characteristics)
 * Control   : Two-zone sequential electrovalve + pump relay
 * Scheduler : Five schedule types, NVS-persistent, GMT-6 fixed offset
 *
 * Relay logic is inverted: LOW = ON, HIGH = OFF.
 * Pins: 23 = pump, 25 = zone 1 valve, 26 = zone 2 valve, 2 = LED
 */

#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>

// ============================================================
// BLE UUIDs
// ============================================================
#define SERVICE_UUID      "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define COMMAND_CHAR_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define STATUS_CHAR_UUID  "beb5483f-36e1-4688-b7f5-ea07361b26a8"

// ============================================================
// Hardware pin constants (inverted relay logic: LOW = ON)
// ============================================================
const int pumpPin  = 23;
const int zonePin1 = 25;
const int zonePin2 = 26;
const int ledPin   = 2;

// ============================================================
// Schedule model
// ============================================================
#define MAX_SCHEDULES 20

struct Schedule {
  int      id;
  int      zone_id;        // 1 or 2
  int      hour;           // 0–23 local time
  int      minute;         // 0–59 local time
  int      duration;       // run length in minutes
  String   type;           // "daily" | "weekly" | "interval" | "monthly" | "once"
  String   date;           // YYYY-MM-DD — start date (interval) / fire date (once)
  uint8_t  days_mask;      // weekly: bit0=Sun … bit6=Sat
  uint32_t month_mask;     // monthly: bit0=day1 … bit30=day31
  int      interval_days;  // interval: every N days
  bool     active;
  time_t   lastRun;        // Unix timestamp of last fire (reboot-safe)
};

Schedule schedules[MAX_SCHEDULES];
int scheduleCount = 0;

// ============================================================
// Control-layer runtime state
// ============================================================
bool          zone1Active         = false;
bool          zone2Active         = false;
int           activeZoneId        = 0;    // 0 = none, 1 | 2
unsigned long zoneStartTime       = 0;    // millis() when zone opened
int           currentZoneDuration = 0;    // minutes, for the active run
bool          pumpManual          = false; // pump forced on with no valve (purge/test)

// ============================================================
// Scheduler-layer state
// ============================================================
bool          timeSynced        = false;  // hard gate — scheduler inert until true
unsigned long lastScheduleCheck = 0;
unsigned long lastTimeSave      = 0;     // tracks hourly NVS time persistence

// ============================================================
// BLE objects and connection state
// ============================================================
NimBLEServer*         pServer      = nullptr;
NimBLECharacteristic* pCommandChar = nullptr;
NimBLECharacteristic* pStatusChar  = nullptr;

bool          deviceConnected = false;
bool          mtuReady        = false;
bool          firstStatusSent = false;
unsigned long connectTime     = 0;

// ============================================================
// NVS
// ============================================================
Preferences preferences;

// ============================================================
// Forward declarations
// ============================================================
void runNvsMigration();
void loadSchedules();
void saveSchedules();
void saveScheduleLastRun(Schedule& s, int index);
void initBLE();
void dispatchCommand(String raw);
bool isAnyZoneActive();
bool canStartZone(int zoneId);
void zoneControl(int zoneId, bool state);
void applyTime(uint32_t ts);
void saveCurrentTime();
void restoreSavedTime();
void setFallbackTime();
bool alreadyRanToday(Schedule& s, time_t now);
bool checkScheduleMatch(Schedule& s, struct tm& t);
void checkAllSchedules();
void notifyStatus(String json);
void notifyZoneStatus(int zoneId, bool state);
void notifyPumpStatus(bool state);
void notifyScheduleStart(int zoneId, int duration);
void notifyScheduleComplete(int zoneId, int duration);
void notifyLog(String message);
void notifyError(String message);
void sendSystemStatus();
void sendAllSchedules();

// ============================================================
// BLE Server Callbacks
// ============================================================
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& connInfo) override {
    deviceConnected  = true;
    connectTime      = millis();
    firstStatusSent  = false;
    mtuReady         = false;
    Serial.println("BLE client connected");
  }

  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& connInfo, int reason) override {
    deviceConnected = false;
    mtuReady        = false;
    Serial.println("BLE client disconnected — restarting advertising");
    NimBLEDevice::startAdvertising();
  }

  void onMTUChange(uint16_t MTU, NimBLEConnInfo& connInfo) override {
    Serial.printf("MTU negotiated: %u\n", MTU);
    mtuReady = true;
    if (!firstStatusSent) {
      sendSystemStatus();
      firstStatusSent = true;
    }
  }
};

// ============================================================
// BLE Command Characteristic Callbacks
// ============================================================
class CommandCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo& connInfo) override {
    String raw = String(characteristic->getValue().c_str());
    dispatchCommand(raw);
  }
};

// ============================================================
// Control Layer — zone and pump state machine
// ============================================================

bool isAnyZoneActive() {
  return zone1Active || zone2Active;
}

bool canStartZone(int zoneId) {
  if (zoneId != 1 && zoneId != 2) return false;
  // Another zone is already running — sequential only
  if (activeZoneId != 0 && activeZoneId != zoneId) return false;
  return true;
}

/**
 * Single enforcement point for valve + pump relay coordination.
 * Invariant I2: pump is ON iff (activeZoneId != 0 OR pumpManual == true).
 */
void zoneControl(int zoneId, bool state) {
  int pin = (zoneId == 1) ? zonePin1 : zonePin2;

  if (state) {
    if (!canStartZone(zoneId)) {
      notifyError("zone busy");
      return;
    }
    digitalWrite(pin, LOW);                          // valve ON (inverted logic)
    if (zoneId == 1) zone1Active = true;
    else             zone2Active = true;
    activeZoneId  = zoneId;
    digitalWrite(pumpPin, LOW);                      // pump ON — follows valve (I2)
    zoneStartTime = millis();
    notifyZoneStatus(zoneId, true);
    notifyPumpStatus(true);
  } else {
    digitalWrite(pin, HIGH);                         // valve OFF
    if (zoneId == 1) zone1Active = false;
    else             zone2Active = false;
    if (activeZoneId == zoneId) activeZoneId = 0;
    if (!isAnyZoneActive() && !pumpManual)
      digitalWrite(pumpPin, HIGH);                   // pump OFF — nothing needs it (I2)
    notifyZoneStatus(zoneId, false);
    notifyPumpStatus(isAnyZoneActive() || pumpManual);
  }
}

// ============================================================
// Time Management
// ============================================================

/**
 * Apply UTC timestamp from app: subtract GMT-6 offset, set system time,
 * and activate the scheduler.
 */
void applyTime(uint32_t ts) {
  time_t local = (time_t)ts - 21600;  // GMT-6 fixed offset (-21600 s), no DST
  struct timeval tv = { .tv_sec = local, .tv_usec = 0 };
  settimeofday(&tv, nullptr);
  timeSynced = true;
  saveCurrentTime();
  notifyLog("time synced");
  Serial.println("Time synced via BLE");
}

/**
 * Persist current local time and millis() to NVS so the next boot can
 * estimate the current time without waiting for the app.
 */
void saveCurrentTime() {
  if (!timeSynced) return;
  time_t now = time(nullptr);
  preferences.begin("irrigation", false);
  preferences.putULong("sTime",   (unsigned long)now);
  preferences.putULong("sMillis", millis());
  preferences.end();
}

/**
 * On boot: try to restore the last saved time and advance it by the
 * elapsed millis since the previous save. If successful, timeSynced = true
 * and the scheduler runs immediately — no app connection required.
 */
void restoreSavedTime() {
  preferences.begin("irrigation", true);
  unsigned long savedTime   = preferences.getULong("sTime",   0);
  unsigned long savedMillis = preferences.getULong("sMillis", 0);
  preferences.end();

  if (savedTime == 0) {
    setFallbackTime();  // no saved time — use safe fallback, scheduler waits for app
    return;
  }

  // Estimate current time: saved local timestamp + seconds elapsed since last save.
  // millis() resets on reboot so currentMillis < savedMillis is expected — in that
  // case we skip the adjustment (device was off; best guess is savedTime itself).
  unsigned long currentMillis = millis();
  unsigned long elapsedSec = (currentMillis < savedMillis)
                               ? 0
                               : (currentMillis - savedMillis) / 1000;

  time_t estimated = (time_t)(savedTime + elapsedSec);
  struct timeval tv = { .tv_sec = estimated, .tv_usec = 0 };
  settimeofday(&tv, nullptr);
  timeSynced = true;

  Serial.println("Time restored from NVS — scheduler active");
}

/**
 * Seed a sane date so localtime() works, but leave timeSynced = false
 * so the scheduler does not fire until the app sends sync_time.
 */
void setFallbackTime() {
  struct tm t = {};
  t.tm_year = 2026 - 1900;
  t.tm_mon  = 0;  // January
  t.tm_mday = 1;
  t.tm_hour = 0;
  t.tm_min  = 0;
  t.tm_sec  = 0;
  time_t fallback = mktime(&t);
  struct timeval tv = { .tv_sec = fallback, .tv_usec = 0 };
  settimeofday(&tv, nullptr);
  Serial.println("Fallback time set — awaiting sync");
}

// ============================================================
// Scheduler — type-match helpers
// ============================================================

/**
 * Return true if this schedule already fired today (or ever, for "once").
 * Uses localtime_r for calendar-day comparison.
 */
bool alreadyRanToday(Schedule& s, time_t now) {
  if (s.lastRun == 0) return false;
  if (s.type == "once") return true;  // one-shot: lastRun != 0 means consumed

  struct tm tNow = {}, tLast = {};
  localtime_r(&now, &tNow);
  localtime_r(&s.lastRun, &tLast);
  return (tNow.tm_year == tLast.tm_year &&
          tNow.tm_mon  == tLast.tm_mon  &&
          tNow.tm_mday == tLast.tm_mday);
}

/**
 * Parse "YYYY-MM-DD" into year (full), month (0-based), mday (1-based).
 * Returns false if the string is malformed.
 */
static bool parseDate(const String& s, int& year, int& mon, int& mday) {
  if (s.length() < 10) return false;
  year = s.substring(0, 4).toInt();
  mon  = s.substring(5, 7).toInt() - 1;  // convert to 0-based
  mday = s.substring(8, 10).toInt();
  return (year > 2000 && mon >= 0 && mon < 12 && mday >= 1 && mday <= 31);
}

/**
 * Return true if this schedule should fire on the given local struct tm.
 * HH:MM match is already verified by the caller.
 */
bool checkScheduleMatch(Schedule& s, struct tm& t) {
  if (s.type == "daily") {
    return true;
  }

  if (s.type == "weekly") {
    // tm_wday: 0=Sun … 6=Sat; days_mask bit0=Sun … bit6=Sat
    return (s.days_mask >> t.tm_wday) & 1;
  }

  if (s.type == "monthly") {
    // tm_mday 1..31; month_mask bit0=day1 … bit30=day31
    if (t.tm_mday < 1 || t.tm_mday > 31) return false;
    return (s.month_mask >> (t.tm_mday - 1)) & 1;
  }

  if (s.type == "once") {
    int y, m, d;
    if (!parseDate(s.date, y, m, d)) return false;
    return (t.tm_year + 1900 == y && t.tm_mon == m && t.tm_mday == d);
  }

  if (s.type == "interval") {
    int y, m, d;
    if (!parseDate(s.date, y, m, d)) return false;
    if (s.interval_days <= 0) return false;

    // Normalise both dates to local midnight before dividing
    struct tm todayMid = t;
    todayMid.tm_hour = 0; todayMid.tm_min = 0; todayMid.tm_sec = 0;
    time_t todayMidnight = mktime(&todayMid);

    struct tm startMid = {};
    startMid.tm_year = y - 1900;
    startMid.tm_mon  = m;
    startMid.tm_mday = d;
    time_t startMidnight = mktime(&startMid);

    long daysSinceStart = (long)((todayMidnight - startMidnight) / 86400L);
    return (daysSinceStart >= 0 && (daysSinceStart % s.interval_days) == 0);
  }

  return false;
}

// ============================================================
// Scheduler — main tick
// ============================================================

void checkAllSchedules() {
  // Hard gate: scheduler is inert until time is synced
  if (!timeSynced) {
    notifyLog("time not synced");
    return;
  }

  time_t now = time(nullptr);
  struct tm t = {};
  localtime_r(&now, &t);

  for (int i = 0; i < scheduleCount; i++) {
    Schedule& s = schedules[i];
    if (!s.active) continue;
    if (isAnyZoneActive()) {
      notifyLog("zone skipped — zone active");
      break;
    }
    if (s.hour != t.tm_hour || s.minute != t.tm_min) continue;
    if (!checkScheduleMatch(s, t)) continue;
    if (alreadyRanToday(s, now)) continue;

    // Fire
    s.lastRun = now;
    saveScheduleLastRun(s, i);
    currentZoneDuration = s.duration;
    zoneControl(s.zone_id, true);
    notifyScheduleStart(s.zone_id, s.duration);
  }
}

// ============================================================
// NVS — migration (runs once at setup before loadSchedules)
// ============================================================

void runNvsMigration() {
  preferences.begin("irrigation", false);
  bool hasOld = preferences.isKey("sched0_id");   // old layout sentinel
  bool hasNew = preferences.isKey("fw_version");  // new layout sentinel

  if (hasOld && !hasNew) {
    preferences.clear();  // wipe entire namespace — incompatible structs
    Serial.println("NVS migration: legacy data wiped, starting clean");
  }

  if (!preferences.isKey("fw_version")) {
    preferences.putInt("fw_version", 1);
    preferences.putInt("offset", -21600);
    preferences.putInt("count", 0);
    Serial.println("NVS migration: new layout stamped (fw_version=1)");
  }

  preferences.end();
}

// ============================================================
// NVS — schedule persistence
// NVS key format: "s{index}{suffix}" e.g. "s0zone", "s19interval" (max 11 chars, ≤15 limit)
// ============================================================

void loadSchedules() {
  preferences.begin("irrigation", true);
  scheduleCount = preferences.getInt("count", 0);
  if (scheduleCount > MAX_SCHEDULES) scheduleCount = MAX_SCHEDULES;

  for (int i = 0; i < scheduleCount; i++) {
    String p = "s" + String(i);
    schedules[i].id            = preferences.getInt   ((p + "id"      ).c_str(), 0);
    schedules[i].zone_id       = preferences.getInt   ((p + "zone"    ).c_str(), 1);
    schedules[i].hour          = preferences.getInt   ((p + "hr"      ).c_str(), 0);
    schedules[i].minute        = preferences.getInt   ((p + "min"     ).c_str(), 0);
    schedules[i].duration      = preferences.getInt   ((p + "dur"     ).c_str(), 0);
    schedules[i].type          = preferences.getString((p + "type"    ).c_str(), "daily");
    schedules[i].date          = preferences.getString((p + "date"    ).c_str(), "");
    schedules[i].days_mask     = preferences.getUChar ((p + "days"    ).c_str(), 0);
    schedules[i].month_mask    = preferences.getUInt  ((p + "mdays"   ).c_str(), 0);
    schedules[i].interval_days = preferences.getInt   ((p + "interval").c_str(), 1);
    schedules[i].active        = preferences.getBool  ((p + "act"     ).c_str(), true);
    schedules[i].lastRun       = (time_t)preferences.getULong64((p + "lastRun").c_str(), 0);
  }

  preferences.end();
  Serial.printf("Loaded %d schedule(s)\n", scheduleCount);
}

void saveSchedules() {
  preferences.begin("irrigation", false);
  preferences.putInt("count", scheduleCount);

  for (int i = 0; i < scheduleCount; i++) {
    String p = "s" + String(i);
    preferences.putInt   ((p + "id"      ).c_str(), schedules[i].id);
    preferences.putInt   ((p + "zone"    ).c_str(), schedules[i].zone_id);
    preferences.putInt   ((p + "hr"      ).c_str(), schedules[i].hour);
    preferences.putInt   ((p + "min"     ).c_str(), schedules[i].minute);
    preferences.putInt   ((p + "dur"     ).c_str(), schedules[i].duration);
    preferences.putString((p + "type"    ).c_str(), schedules[i].type);
    preferences.putString((p + "date"    ).c_str(), schedules[i].date);
    preferences.putUChar ((p + "days"    ).c_str(), schedules[i].days_mask);
    preferences.putUInt  ((p + "mdays"   ).c_str(), schedules[i].month_mask);
    preferences.putInt   ((p + "interval").c_str(), schedules[i].interval_days);
    preferences.putBool  ((p + "act"     ).c_str(), schedules[i].active);
    preferences.putULong64((p + "lastRun").c_str(), (uint64_t)schedules[i].lastRun);
  }

  preferences.end();
}

/** Persist only the lastRun field for a single schedule (called after scheduler fires). */
void saveScheduleLastRun(Schedule& s, int index) {
  preferences.begin("irrigation", false);
  String p = "s" + String(index);
  preferences.putULong64((p + "lastRun").c_str(), (uint64_t)s.lastRun);
  preferences.end();
}

// ============================================================
// Notify helpers — all route through notifyStatus()
// ============================================================

/** Single choke-point: set value on Status characteristic and notify. */
void notifyStatus(String json) {
  if (!deviceConnected || pStatusChar == nullptr) return;
  pStatusChar->setValue(json.c_str());
  pStatusChar->notify();
}

void notifyZoneStatus(int zoneId, bool state) {
  DynamicJsonDocument doc(256);
  doc["type"]    = "zone_status";
  doc["zone_id"] = zoneId;
  doc["active"]  = state;
  String out;
  serializeJson(doc, out);
  notifyStatus(out);
}

void notifyPumpStatus(bool state) {
  DynamicJsonDocument doc(128);
  doc["type"]   = "pump_status";
  doc["active"] = state;
  String out;
  serializeJson(doc, out);
  notifyStatus(out);
}

void notifyScheduleStart(int zoneId, int duration) {
  DynamicJsonDocument doc(128);
  doc["type"]     = "schedule_start";
  doc["zone_id"]  = zoneId;
  doc["duration"] = duration;
  String out;
  serializeJson(doc, out);
  notifyStatus(out);
}

void notifyScheduleComplete(int zoneId, int duration) {
  DynamicJsonDocument doc(128);
  doc["type"]     = "schedule_complete";
  doc["zone_id"]  = zoneId;
  doc["duration"] = duration;
  String out;
  serializeJson(doc, out);
  notifyStatus(out);
}

void notifyLog(String message) {
  DynamicJsonDocument doc(256);
  doc["type"]    = "log_entry";
  doc["message"] = message;
  String out;
  serializeJson(doc, out);
  notifyStatus(out);
}

void notifyError(String message) {
  DynamicJsonDocument doc(128);
  doc["type"]    = "error";
  doc["message"] = message;
  String out;
  serializeJson(doc, out);
  notifyStatus(out);
}

/**
 * Compact system status notification — kept under 180 bytes.
 * No schedule array inside; schedules are streamed separately via sendAllSchedules().
 */
void sendSystemStatus() {
  DynamicJsonDocument doc(256);
  doc["type"]           = "system_status";
  doc["zone1_active"]   = zone1Active;
  doc["zone2_active"]   = zone2Active;
  doc["pump_active"]    = (activeZoneId != 0 || pumpManual);
  doc["pump_manual"]    = pumpManual;
  doc["time_synced"]    = timeSynced;
  doc["schedule_count"] = scheduleCount;

  if (timeSynced) {
    time_t now = time(nullptr);
    struct tm t = {};
    localtime_r(&now, &t);
    char buf[6];
    snprintf(buf, sizeof(buf), "%02d:%02d", t.tm_hour, t.tm_min);
    doc["local_time"] = buf;
  }

  String out;
  serializeJson(doc, out);
  notifyStatus(out);
}

/**
 * Stream all schedules as individual notify calls — one per schedule.
 * 10 ms inter-notify yield prevents overrunning the BLE notify queue.
 */
void sendAllSchedules() {
  for (int i = 0; i < scheduleCount; i++) {
    DynamicJsonDocument doc(256);
    doc["type"]          = "schedule_item";
    doc["id"]            = schedules[i].id;
    doc["zone_id"]       = schedules[i].zone_id;
    doc["hour"]          = schedules[i].hour;
    doc["minute"]        = schedules[i].minute;
    doc["duration"]      = schedules[i].duration;
    doc["sched_type"]    = schedules[i].type;
    doc["date"]          = schedules[i].date;
    doc["days_mask"]     = schedules[i].days_mask;
    doc["month_mask"]    = schedules[i].month_mask;
    doc["interval_days"] = schedules[i].interval_days;
    doc["active"]        = schedules[i].active;
    doc["last_run"]      = (uint32_t)schedules[i].lastRun;
    String out;
    serializeJson(doc, out);
    notifyStatus(out);
    delay(10);
  }
}

// ============================================================
// Command Dispatch — Transport → Control / Scheduler
// ============================================================

void dispatchCommand(String raw) {
  Serial.println("BLE cmd: " + raw);

  DynamicJsonDocument doc(512);
  DeserializationError err = deserializeJson(doc, raw);
  if (err) {
    notifyError("invalid JSON");
    return;
  }

  String command = doc["command"].as<String>();

  // ---- pump_on ----
  if (command == "pump_on") {
    pumpManual = true;
    digitalWrite(pumpPin, LOW);
    notifyPumpStatus(true);
    notifyLog("pump manual on");

  // ---- pump_off ----
  } else if (command == "pump_off") {
    pumpManual = false;
    // Zone wins: if a zone is active, the pump stays on
    if (!isAnyZoneActive()) {
      digitalWrite(pumpPin, HIGH);
    }
    notifyPumpStatus(isAnyZoneActive());
    notifyLog("pump manual off");

  // ---- zone_on ----
  } else if (command == "zone_on") {
    int zoneId = doc["zone_id"] | 1;
    int dur    = doc["duration"] | 10;
    if (!canStartZone(zoneId)) {
      notifyLog("zone busy");
    } else {
      currentZoneDuration = dur;
      zoneControl(zoneId, true);
    }

  // ---- zone_off ----
  } else if (command == "zone_off") {
    int zoneId = doc["zone_id"] | 1;
    zoneControl(zoneId, false);

  // ---- add_schedule ----
  } else if (command == "add_schedule") {
    int id  = doc["id"] | 0;

    // Find existing entry (update) or allocate a new slot (add)
    int idx = -1;
    for (int i = 0; i < scheduleCount; i++) {
      if (schedules[i].id == id) { idx = i; break; }
    }
    bool isNew = (idx == -1);
    if (isNew) {
      if (scheduleCount >= MAX_SCHEDULES) {
        notifyError("schedule limit reached");
        return;
      }
      idx = scheduleCount++;
    }

    schedules[idx].id            = id;
    schedules[idx].zone_id       = doc["zone_id"]       | 1;
    schedules[idx].hour          = doc["hour"]           | 0;
    schedules[idx].minute        = doc["minute"]         | 0;
    schedules[idx].duration      = doc["duration"]       | 10;
    schedules[idx].type          = doc["type"].as<String>();
    schedules[idx].date          = doc["date"].as<String>();
    schedules[idx].days_mask     = (uint8_t)(doc["days_mask"]     | 0);
    schedules[idx].month_mask    = (uint32_t)(doc["month_mask"]   | 0);
    schedules[idx].interval_days = doc["interval_days"]  | 1;
    schedules[idx].active        = doc["active"]         | true;
    schedules[idx].lastRun       = 0;

    saveSchedules();
    sendAllSchedules();
    notifyLog(isNew ? "schedule added" : "schedule updated");

  // ---- delete_schedule ----
  } else if (command == "delete_schedule") {
    int id = doc["id"] | -1;
    bool found = false;
    for (int i = 0; i < scheduleCount; i++) {
      if (schedules[i].id == id) {
        // Compact the array
        for (int j = i; j < scheduleCount - 1; j++) {
          schedules[j] = schedules[j + 1];
        }
        scheduleCount--;
        saveSchedules();
        sendAllSchedules();
        notifyLog("schedule deleted");
        found = true;
        break;
      }
    }
    if (!found) notifyError("schedule not found");

  // ---- get_status ----
  } else if (command == "get_status") {
    sendSystemStatus();
    sendAllSchedules();

  // ---- sync_time ----
  } else if (command == "sync_time") {
    uint32_t ts = doc["utc_timestamp"] | 0;
    if (ts > 0) {
      applyTime(ts);
    } else {
      notifyError("invalid timestamp");
    }

  // ---- unknown ----
  } else {
    notifyError("unknown command");
  }
}

// ============================================================
// BLE Initialization
// ============================================================

void initBLE() {
  NimBLEDevice::init("RiegoESP32");
  NimBLEDevice::setMTU(247);  // request 247-byte MTU globally

  pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService* svc = pServer->createService(SERVICE_UUID);

  // Command characteristic: write-only (WRITE | WRITE_NO_RESPONSE)
  pCommandChar = svc->createCharacteristic(
    COMMAND_CHAR_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  pCommandChar->setCallbacks(new CommandCallbacks());

  // Status characteristic: notify + read
  pStatusChar = svc->createCharacteristic(
    STATUS_CHAR_UUID,
    NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ
  );

  svc->start();

  NimBLEAdvertising* adv = pServer->getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->start();

  Serial.println("BLE ready — advertising as 'RiegoESP32'");
}

// ============================================================
// setup()
// ============================================================

void setup() {
  Serial.begin(115200);

  // Drive all relays to OFF state before anything else (inverted: HIGH = OFF).
  // This ensures a reboot never leaves a valve or pump latched on.
  pinMode(pumpPin,  OUTPUT); digitalWrite(pumpPin,  HIGH);
  pinMode(zonePin1, OUTPUT); digitalWrite(zonePin1, HIGH);
  pinMode(zonePin2, OUTPUT); digitalWrite(zonePin2, HIGH);
  pinMode(ledPin,   OUTPUT); digitalWrite(ledPin,   LOW);

  runNvsMigration();   // wipe legacy NVS if needed, stamp fw_version
  restoreSavedTime();  // restore last known time; falls back to static seed if none saved
  loadSchedules();     // populate schedules[] from NVS
  initBLE();          // start GATT server and advertising

  Serial.println("=== Irrigation System Ready ===");
}

// ============================================================
// loop()
// ============================================================

void loop() {
  // (a) Deferred first-status notify after MTU negotiation or 1 s timeout.
  //     Prevents truncated payloads on centrals that negotiate MTU slowly.
  if (deviceConnected && !firstStatusSent &&
      (mtuReady || (millis() - connectTime) > 1000UL)) {
    sendSystemStatus();
    firstStatusSent = true;
  }

  // (b) Duration tick — check if the active zone has finished its run.
  if (activeZoneId != 0) {
    if ((millis() - zoneStartTime) >= (unsigned long)currentZoneDuration * 60000UL) {
      int z = activeZoneId;
      zoneControl(z, false);
      notifyScheduleComplete(z, currentZoneDuration);
      currentZoneDuration = 0;
    }
  }

  // (c) 60 s schedule tick — check all schedules once per minute.
  if ((millis() - lastScheduleCheck) >= 60000UL) {
    lastScheduleCheck = millis();
    checkAllSchedules();
  }

  // (d) Hourly NVS time save — allows next boot to restore time without app.
  if (timeSynced && (millis() - lastTimeSave) >= 3600000UL) {
    lastTimeSave = millis();
    saveCurrentTime();
  }
}

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useIrrigationStore } from '@/src/stores/useIrrigationStore';
import { bleService } from '@/src/ble/BleService';
import { cmd, Schedule, ScheduleType } from '@/src/ble/bleConstants';
import { toggleDay, isDaySet, toggleMonthDay, isMonthDaySet } from '@/src/utils/maskUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHEDULE_TYPES: ScheduleType[] = ['daily', 'weekly', 'interval', 'monthly', 'once'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function validateDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface WeeklyPickerProps {
  daysMask: number;
  onToggle: (dayIndex: number) => void;
}

function WeeklyPicker({ daysMask, onToggle }: WeeklyPickerProps) {
  return (
    <View style={styles.dayGrid}>
      {DAY_LABELS.map((label, i) => {
        const active = isDaySet(daysMask, i);
        return (
          <TouchableOpacity
            key={label}
            style={[styles.dayBtn, active && styles.dayBtnActive]}
            onPress={() => onToggle(i)}
          >
            <Text style={[styles.dayBtnText, active && styles.dayBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface MonthlyPickerProps {
  monthMask: number;
  onToggle: (day: number) => void;
}

function MonthlyPicker({ monthMask, onToggle }: MonthlyPickerProps) {
  // Render a 7-column grid of day numbers 1–31 (+ empty filler cells)
  const cells: (number | null)[] = [];
  for (let i = 1; i <= 31; i++) cells.push(i);
  // Pad to next multiple of 7
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={styles.monthGrid}>
      {cells.map((day, idx) => {
        if (day === null) {
          return <View key={`empty-${idx}`} style={styles.monthCell} />;
        }
        const active = isMonthDaySet(monthMask, day);
        return (
          <TouchableOpacity
            key={day}
            style={[styles.monthCell, active && styles.monthCellActive]}
            onPress={() => onToggle(day)}
          >
            <Text style={[styles.monthCellText, active && styles.monthCellTextActive]}>
              {day}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Add Schedule screen ──────────────────────────────────────────────────────

export default function NewScheduleScreen() {
  const { nextScheduleId } = useIrrigationStore();

  // Common fields
  const [zone, setZone] = useState<1 | 2 | null>(null);
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [duration, setDuration] = useState('');
  const [type, setType] = useState<ScheduleType>('daily');

  // Type-specific fields
  const [daysMask, setDaysMask] = useState(0);
  const [monthMask, setMonthMask] = useState(0);
  const [date, setDate] = useState(todayISO()); // used by interval (start) and once
  const [intervalDays, setIntervalDays] = useState('');

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleDay = (dayIndex: number) => {
    setDaysMask((prev) => toggleDay(prev, dayIndex));
  };

  const handleToggleMonthDay = (day: number) => {
    setMonthMask((prev) => toggleMonthDay(prev, day));
  };

  const validate = (): string | null => {
    if (zone === null) return 'Select a zone.';

    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    if (isNaN(h) || h < 0 || h > 23) return 'Hour must be 0–23.';
    if (isNaN(m) || m < 0 || m > 59) return 'Minute must be 0–59.';

    const dur = parseInt(duration, 10);
    if (isNaN(dur) || dur < 1 || dur > 120) return 'Duration must be 1–120 minutes.';

    switch (type) {
      case 'weekly':
        if (daysMask === 0) return 'Select at least one day of the week.';
        break;
      case 'monthly':
        if (monthMask === 0) return 'Select at least one day of the month.';
        break;
      case 'interval': {
        if (!validateDate(date)) return 'Enter a valid start date (YYYY-MM-DD).';
        const intDays = parseInt(intervalDays, 10);
        if (isNaN(intDays) || intDays < 1) return 'Interval must be at least 1 day.';
        break;
      }
      case 'once':
        if (!validateDate(date)) return 'Enter a valid date (YYYY-MM-DD).';
        break;
    }
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      Alert.alert('Validation', error);
      return;
    }

    const schedule: Schedule = {
      id: nextScheduleId(),
      zone_id: zone!,
      hour: parseInt(hour, 10),
      minute: parseInt(minute, 10),
      duration: parseInt(duration, 10),
      type,
      date: type === 'interval' || type === 'once' ? date : '',
      days_mask: type === 'weekly' ? daysMask : 0,
      month_mask: type === 'monthly' ? monthMask : 0,
      interval_days: type === 'interval' ? parseInt(intervalDays, 10) : 0,
      active: true,
    };

    await bleService.sendCommand(cmd.addSchedule(schedule));
    // Firmware will re-emit the full schedule list via sendAllSchedules
    // → accumulation path updates useIrrigationStore reactively
    router.back();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

      {/* Zone selector */}
      <View style={styles.section}>
        <Text style={styles.label}>Zone</Text>
        <View style={styles.segmentRow}>
          {([1, 2] as const).map((z) => (
            <TouchableOpacity
              key={z}
              style={[styles.segment, zone === z && styles.segmentActive]}
              onPress={() => setZone(z)}
            >
              <Text style={[styles.segmentText, zone === z && styles.segmentTextActive]}>
                Zone {z}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Time picker */}
      <View style={styles.section}>
        <Text style={styles.label}>Time</Text>
        <View style={styles.timeRow}>
          <TextInput
            style={[styles.input, styles.timeInput]}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="HH"
            value={hour}
            onChangeText={setHour}
          />
          <Text style={styles.timeSep}>:</Text>
          <TextInput
            style={[styles.input, styles.timeInput]}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="MM"
            value={minute}
            onChangeText={setMinute}
          />
        </View>
      </View>

      {/* Duration */}
      <View style={styles.section}>
        <Text style={styles.label}>Duration (minutes, 1–120)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="e.g. 15"
          value={duration}
          onChangeText={setDuration}
        />
      </View>

      {/* Type selector */}
      <View style={styles.section}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.typeGrid}>
          {SCHEDULE_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, type === t && styles.typeBtnActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Type-conditional fields ─────────────────────────────────────── */}

      {type === 'weekly' && (
        <View style={styles.section}>
          <Text style={styles.label}>Days of the week</Text>
          <WeeklyPicker daysMask={daysMask} onToggle={handleToggleDay} />
        </View>
      )}

      {type === 'monthly' && (
        <View style={styles.section}>
          <Text style={styles.label}>Days of the month</Text>
          <MonthlyPicker monthMask={monthMask} onToggle={handleToggleMonthDay} />
        </View>
      )}

      {type === 'interval' && (
        <View style={styles.section}>
          <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="2025-07-01"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Repeat every N days</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="e.g. 3"
            value={intervalDays}
            onChangeText={setIntervalDays}
          />
        </View>
      )}

      {type === 'once' && (
        <View style={styles.section}>
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="2025-07-04"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
          />
        </View>
      )}

      {/* Save */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Schedule</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 4,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 20,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    width: 72,
    textAlign: 'center',
  },
  timeSep: {
    fontSize: 24,
    fontWeight: '700',
    color: '#64748b',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  segmentActive: {
    backgroundColor: '#1a7fd4',
    borderColor: '#1a7fd4',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentTextActive: {
    color: '#fff',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  typeBtnActive: {
    backgroundColor: '#1a7fd4',
    borderColor: '#1a7fd4',
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  typeBtnTextActive: {
    color: '#fff',
  },
  // Weekly day grid
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayBtnActive: {
    backgroundColor: '#1a7fd4',
    borderColor: '#1a7fd4',
  },
  dayBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  dayBtnTextActive: {
    color: '#fff',
  },
  // Monthly day grid
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthCell: {
    width: '13%',
    aspectRatio: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthCellActive: {
    backgroundColor: '#1a7fd4',
    borderColor: '#1a7fd4',
  },
  monthCellText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  monthCellTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  // Save button
  saveBtn: {
    backgroundColor: '#1a7fd4',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

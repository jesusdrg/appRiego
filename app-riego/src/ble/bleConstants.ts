// BLE UUIDs matching the firmware (riego.ino)
export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const COMMAND_CHAR = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const STATUS_CHAR = 'beb5483f-36e1-4688-b7f5-ea07361b26a8';
export const DEVICE_NAME = 'RiegoESP32';

export type ScheduleType = 'daily' | 'weekly' | 'interval' | 'monthly' | 'once';

export interface Schedule {
  id: number;
  zone_id: 1 | 2;
  hour: number;
  minute: number;
  duration: number;
  type: ScheduleType;
  date: string;
  days_mask: number;
  month_mask: number;
  interval_days: number;
  active: boolean;
  last_run?: number;
}

export interface ZoneState {
  active: boolean;
}

export interface SystemStatus {
  zone1_active: boolean;
  zone2_active: boolean;
  pump_active: boolean;
  pump_manual: boolean;
  time_synced: boolean;
  auto_mode: boolean;
  schedule_count: number;
  local_time?: string;
  /** Uptime in milliseconds (firmware: millis() - systemStartTime) */
  uptime?: number;
}

export interface LogEntry {
  ts: number;
  level: 'info' | 'error' | 'event';
  message: string;
}

// Command builders — always emit `type` (not `sched_type`) to match firmware write contract
export const cmd = {
  pumpOn: () => ({ command: 'pump_on' }),
  pumpOff: () => ({ command: 'pump_off' }),
  zoneOn: (zone_id: number, duration: number) => ({ command: 'zone_on', zone_id, duration }),
  zoneOff: (zone_id: number) => ({ command: 'zone_off', zone_id }),
  deleteSchedule: (id: number) => ({ command: 'delete_schedule', id }),
  getStatus: () => ({ command: 'get_status' }),
  // sync_time: send current UTC unix seconds; firmware applies GMT-6 offset itself
  syncTime: () => ({ command: 'sync_time', utc_timestamp: Math.floor(Date.now() / 1000) }),
  // addSchedule: spreads Schedule fields — uses `type` field as required by firmware write command
  addSchedule: (s: Schedule) => ({ command: 'add_schedule', ...s }),
} as const;

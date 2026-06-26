import { Schedule, ScheduleType, SystemStatus } from './bleConstants';

// Discriminated union of all firmware notify event types.
// NOTE: schedule_item wraps the Schedule in `.item` to avoid a naming conflict:
// the event discriminant uses `type: 'schedule_item'` while Schedule itself
// uses `type: ScheduleType`. Keeping them separate removes the intersection clash.
export type BleEvent =
  | ({ type: 'system_status' } & SystemStatus)
  | { type: 'schedule_item'; item: Schedule }
  | { type: 'zone_status'; zone_id: number; active: boolean }
  | { type: 'pump_status'; active: boolean }
  | { type: 'schedule_start'; zone_id: number; duration: number }
  | { type: 'schedule_complete'; zone_id: number; duration: number }
  | { type: 'log_entry'; message: string }
  | { type: 'error'; message: string };

/**
 * Parse a base64-encoded BLE notify value into a typed BleEvent.
 *
 * IMPORTANT: The firmware sends `sched_type` in schedule_item events but expects
 * `type` in write commands. This function normalizes `sched_type` → `type` so the
 * rest of the app works with a single unified field name.
 *
 * Returns null for malformed or unrecognized payloads.
 */
export function parseEvent(base64: string): BleEvent | null {
  try {
    const json = atob(base64);
    const raw = JSON.parse(json);

    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') {
      return null;
    }

    switch (raw.type) {
      case 'system_status':
        return {
          type: 'system_status',
          zone1_active: Boolean(raw.zone1_active),
          zone2_active: Boolean(raw.zone2_active),
          pump_active: Boolean(raw.pump_active),
          pump_manual: Boolean(raw.pump_manual),
          time_synced: Boolean(raw.time_synced),
          auto_mode: Boolean(raw.auto_mode),
          schedule_count: Number(raw.schedule_count ?? 0),
          local_time: raw.local_time != null ? String(raw.local_time) : undefined,
          uptime: raw.uptime != null ? Number(raw.uptime) : undefined,
        };

      case 'schedule_item': {
        // Firmware sends `sched_type`; normalize to `type` for unified app-side field name
        const scheduleType: ScheduleType = (raw.sched_type ?? 'daily') as ScheduleType;
        const item: Schedule = {
          id: Number(raw.id),
          zone_id: Number(raw.zone_id) as 1 | 2,
          hour: Number(raw.hour),
          minute: Number(raw.minute),
          duration: Number(raw.duration),
          type: scheduleType,
          date: raw.date != null ? String(raw.date) : '',
          days_mask: Number(raw.days_mask ?? 0),
          month_mask: Number(raw.month_mask ?? 0),
          interval_days: Number(raw.interval_days ?? 0),
          active: Boolean(raw.active),
          last_run: raw.last_run != null ? Number(raw.last_run) : undefined,
        };
        return { type: 'schedule_item', item };
      }

      case 'zone_status':
        return {
          type: 'zone_status',
          zone_id: Number(raw.zone_id),
          active: Boolean(raw.active),
        };

      case 'pump_status':
        return {
          type: 'pump_status',
          active: Boolean(raw.active),
        };

      case 'schedule_start':
        return {
          type: 'schedule_start',
          zone_id: Number(raw.zone_id),
          duration: Number(raw.duration),
        };

      case 'schedule_complete':
        return {
          type: 'schedule_complete',
          zone_id: Number(raw.zone_id),
          duration: Number(raw.duration),
        };

      case 'log_entry':
        return {
          type: 'log_entry',
          message: String(raw.message ?? ''),
        };

      case 'error':
        return {
          type: 'error',
          message: String(raw.message ?? ''),
        };

      default:
        return null;
    }
  } catch {
    return null;
  }
}

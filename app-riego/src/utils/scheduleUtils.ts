/**
 * scheduleUtils — pure client-side fire-date projection for irrigation schedules.
 * No side effects; fully testable without RN environment.
 */

import { Schedule } from '../ble/bleConstants';
import { isDaySet, isMonthDaySet } from './maskUtils';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// One dot color per zone
const ZONE_DOT_COLORS: Record<number, string> = {
  1: '#3b82f6', // blue — zone 1
  2: '#22c55e', // green — zone 2
};

// ─── computeFireDates ────────────────────────────────────────────────────────

/**
 * Returns all dates when schedule `s` fires within the next `days` days,
 * starting from `from` (inclusive, time 00:00:00).
 *
 * The returned Date objects have their time set to `s.hour:s.minute:00`.
 *
 * @param s     - the schedule to project
 * @param from  - start of the projection window (only the date portion is used)
 * @param days  - number of days to look ahead (default: 60)
 */
export function computeFireDates(s: Schedule, from: Date, days = 60): Date[] {
  const results: Date[] = [];

  // Normalise `from` to midnight local time so we don't skip day 0 based on hour
  const windowStart = new Date(from);
  windowStart.setHours(0, 0, 0, 0);

  if (s.type === 'once') {
    if (!s.date) return [];
    // s.date is YYYY-MM-DD; combine with time for a local-time Date
    const fireDate = localDateAt(s.date, s.hour, s.minute);
    if (fireDate >= windowStart && fireDate < addDays(windowStart, days)) {
      results.push(fireDate);
    }
    return results;
  }

  if (s.type === 'interval') {
    if (!s.date || s.interval_days <= 0) return [];
    const anchor = localMidnight(s.date);
    for (let i = 0; i < days; i++) {
      const day = addDays(windowStart, i);
      const daysSinceAnchor = Math.round((day.getTime() - anchor.getTime()) / MS_PER_DAY);
      if (daysSinceAnchor >= 0 && daysSinceAnchor % s.interval_days === 0) {
        results.push(dayAt(day, s.hour, s.minute));
      }
    }
    return results;
  }

  // daily / weekly / monthly — iterate every day in the window
  for (let i = 0; i < days; i++) {
    const day = addDays(windowStart, i);
    let fires = false;

    switch (s.type) {
      case 'daily':
        fires = true;
        break;
      case 'weekly':
        fires = isDaySet(s.days_mask, day.getDay());
        break;
      case 'monthly':
        fires = isMonthDaySet(s.month_mask, day.getDate());
        break;
    }

    if (fires) {
      results.push(dayAt(day, s.hour, s.minute));
    }
  }

  return results;
}

// ─── aggregateMarkedDates ────────────────────────────────────────────────────

/**
 * Aggregates all schedule fire-dates into react-native-calendars `markedDates`
 * format using `markingType="multi-dot"`.
 *
 * One dot per zone per calendar day — multiple schedules for the same zone on
 * the same day collapse into a single dot.
 *
 * @param schedules - array of schedules from the irrigation store
 * @param days      - projection window in days (default: 60)
 * @returns         - Record<"YYYY-MM-DD", {dots: {color: string}[]}>
 */
export function aggregateMarkedDates(
  schedules: Schedule[],
  days = 60
): Record<string, { dots: { color: string }[] }> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const result: Record<string, { dots: { color: string }[] }> = {};
  // Track which zone_ids already have a dot on each day to avoid duplicates
  const seenZones: Record<string, Set<number>> = {};

  for (const schedule of schedules) {
    const color = ZONE_DOT_COLORS[schedule.zone_id] ?? '#6b7280';
    const fireDates = computeFireDates(schedule, from, days);

    for (const date of fireDates) {
      const key = toYMD(date);
      if (!result[key]) {
        result[key] = { dots: [] };
        seenZones[key] = new Set();
      }
      if (!seenZones[key].has(schedule.zone_id)) {
        result[key].dots.push({ color });
        seenZones[key].add(schedule.zone_id);
      }
    }
  }

  return result;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Parse "YYYY-MM-DD" into a local-time Date at midnight. */
function localMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Parse "YYYY-MM-DD" and return a local-time Date at h:m. */
function localDateAt(dateStr: string, h: number, m: number): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, h, m, 0, 0);
}

/** Clone `base` (midnight local) and add `n` days. */
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** Clone `base` and set its time to h:m. */
function dayAt(base: Date, h: number, m: number): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Format a Date as "YYYY-MM-DD" using local time. */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

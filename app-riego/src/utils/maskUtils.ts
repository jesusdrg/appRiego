/**
 * maskUtils — pure bit-manipulation helpers for schedule masks.
 * No side effects; fully testable without RN environment.
 *
 * days_mask (uint8):  bit0 = Sunday, bit1 = Monday, ..., bit6 = Saturday
 * month_mask (uint32): bit0 = day 1, bit1 = day 2, ..., bit30 = day 31
 *
 * Bit layout matches firmware (riego.ino):
 *   days_mask:  (mask >> tm_wday) & 1
 *   month_mask: (mask >> (tm_mday - 1)) & 1
 */

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type DayLabel = (typeof DAY_LABELS)[number];

// ─── days_mask helpers ───────────────────────────────────────────────────────

/**
 * Toggle a day bit in a days_mask.
 * dayIndex: 0 = Sunday, 6 = Saturday
 * Returns a uint8 (0–127).
 */
export function toggleDay(mask: number, dayIndex: number): number {
  return (mask ^ (1 << dayIndex)) & 0xff;
}

/**
 * Returns true when the given day bit is set in the days_mask.
 */
export function isDaySet(mask: number, dayIndex: number): boolean {
  return ((mask >> dayIndex) & 1) === 1;
}

/**
 * Returns an array of human-readable labels for all days currently set.
 * E.g. mask = 5 (0b00000101) → ['Sun', 'Tue']
 */
export function getDayLabels(mask: number): string[] {
  return DAY_LABELS.filter((_, i) => isDaySet(mask, i));
}

// ─── month_mask helpers ──────────────────────────────────────────────────────

/**
 * Toggle a month-day bit in a month_mask.
 * day: 1–31 → maps to bit (day - 1).
 * Returns an unsigned 32-bit integer (>>>0 forces unsigned representation).
 */
export function toggleMonthDay(mask: number, day: number): number {
  return (mask ^ (1 << (day - 1))) >>> 0;
}

/**
 * Returns true when the given month day (1–31) is set in the month_mask.
 */
export function isMonthDaySet(mask: number, day: number): boolean {
  return ((mask >>> (day - 1)) & 1) === 1;
}

/**
 * Returns an array of month days (1–31) that are currently set.
 * E.g. mask = 16385 (bit0 + bit14) → [1, 15]
 */
export function getMonthDays(mask: number): number[] {
  const days: number[] = [];
  for (let day = 1; day <= 31; day++) {
    if (isMonthDaySet(mask, day)) {
      days.push(day);
    }
  }
  return days;
}

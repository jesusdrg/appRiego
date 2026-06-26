import { computeFireDates, aggregateMarkedDates } from '../scheduleUtils';
import { Schedule } from '../../ble/bleConstants';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const BASE: Schedule = {
  id: 1,
  zone_id: 1,
  hour: 8,
  minute: 0,
  duration: 30,
  type: 'daily',
  date: '',
  days_mask: 0,
  month_mask: 0,
  interval_days: 1,
  active: true,
};

/** Returns a local midnight Date for "YYYY-MM-DD". */
function localDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Returns the YYYY-MM-DD string for a date in local time. */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── daily ────────────────────────────────────────────────────────────────────

describe('computeFireDates — daily', () => {
  const from = localDay('2025-01-01');

  it('returns one date per day within the window', () => {
    const s: Schedule = { ...BASE, type: 'daily' };
    const dates = computeFireDates(s, from, 7);
    expect(dates).toHaveLength(7);
  });

  it('all dates are on consecutive days at hour:minute', () => {
    const s: Schedule = { ...BASE, type: 'daily', hour: 6, minute: 30 };
    const dates = computeFireDates(s, from, 5);
    dates.forEach((d, i) => {
      const expected = new Date(2025, 0, 1 + i, 6, 30, 0, 0);
      expect(d.getTime()).toBe(expected.getTime());
    });
  });

  it('returns 60 dates with default window', () => {
    const s: Schedule = { ...BASE, type: 'daily' };
    expect(computeFireDates(s, from)).toHaveLength(60);
  });
});

// ─── weekly ───────────────────────────────────────────────────────────────────

describe('computeFireDates — weekly', () => {
  // 2025-01-05 is a Sunday; window of 7 days covers Jan 5–11
  const from = localDay('2025-01-05');

  it('returns only dates matching the days_mask', () => {
    // Sun (bit0=1) + Wed (bit3=8) = 9
    const s: Schedule = { ...BASE, type: 'weekly', days_mask: 9 };
    const dates = computeFireDates(s, from, 7);
    // Jan 5 = Sunday, Jan 8 = Wednesday
    expect(dates).toHaveLength(2);
    expect(toYMD(dates[0])).toBe('2025-01-05');
    expect(toYMD(dates[1])).toBe('2025-01-08');
  });

  it('returns empty array when no days are set (zero mask)', () => {
    const s: Schedule = { ...BASE, type: 'weekly', days_mask: 0 };
    expect(computeFireDates(s, from, 7)).toHaveLength(0);
  });

  it('returns 7 dates when all days are set', () => {
    const s: Schedule = { ...BASE, type: 'weekly', days_mask: 0b1111111 };
    expect(computeFireDates(s, from, 7)).toHaveLength(7);
  });

  it('only Saturday (bit6 = 64) in a 7-day window starting Sunday returns 1 date', () => {
    const s: Schedule = { ...BASE, type: 'weekly', days_mask: 64 };
    const dates = computeFireDates(s, from, 7); // Jan 5 (Sun) … Jan 11 (Sat)
    expect(dates).toHaveLength(1);
    expect(dates[0].getDay()).toBe(6); // Saturday
  });
});

// ─── monthly ──────────────────────────────────────────────────────────────────

describe('computeFireDates — monthly', () => {
  it('returns dates only for days set in month_mask', () => {
    // days 1 and 15: bit0 + bit14 = 1 + 16384 = 16385
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'monthly', month_mask: 16385 };
    const dates = computeFireDates(s, from, 31);
    expect(dates).toHaveLength(2);
    expect(dates[0].getDate()).toBe(1);
    expect(dates[1].getDate()).toBe(15);
  });

  it('returns empty array when month_mask is 0', () => {
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'monthly', month_mask: 0 };
    expect(computeFireDates(s, from, 31)).toHaveLength(0);
  });

  it('spans across months correctly in a 60-day window', () => {
    // day 28: bit27 = 1 << 27 = 134217728
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'monthly', month_mask: 1 << 27 };
    const dates = computeFireDates(s, from, 60);
    // Should hit Jan 28 and Feb 28
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates[0].getDate()).toBe(28);
    expect(dates[1].getDate()).toBe(28);
  });
});

// ─── interval ─────────────────────────────────────────────────────────────────

describe('computeFireDates — interval', () => {
  it('fires on correct days with a 3-day interval anchored at window start', () => {
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'interval', date: '2025-01-01', interval_days: 3 };
    const dates = computeFireDates(s, from, 10);
    // Days 0, 3, 6, 9 → Jan 1, 4, 7, 10
    expect(dates).toHaveLength(4);
    expect(toYMD(dates[0])).toBe('2025-01-01');
    expect(toYMD(dates[1])).toBe('2025-01-04');
    expect(toYMD(dates[2])).toBe('2025-01-07');
    expect(toYMD(dates[3])).toBe('2025-01-10');
  });

  it('anchors correctly when anchor is before the window', () => {
    // Anchor Jan 1; every 5 days → Jan 6, Jan 11, …
    // Window starts Jan 6
    const from = localDay('2025-01-06');
    const s: Schedule = { ...BASE, type: 'interval', date: '2025-01-01', interval_days: 5 };
    const dates = computeFireDates(s, from, 10);
    expect(toYMD(dates[0])).toBe('2025-01-06');
    expect(toYMD(dates[1])).toBe('2025-01-11');
  });

  it('returns empty when date is missing', () => {
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'interval', date: '', interval_days: 3 };
    expect(computeFireDates(s, from, 10)).toHaveLength(0);
  });

  it('returns empty when interval_days is 0', () => {
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'interval', date: '2025-01-01', interval_days: 0 };
    expect(computeFireDates(s, from, 10)).toHaveLength(0);
  });
});

// ─── once ─────────────────────────────────────────────────────────────────────

describe('computeFireDates — once', () => {
  it('returns exactly 1 date when the date is within the window', () => {
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'once', date: '2025-01-15', hour: 10, minute: 30 };
    const dates = computeFireDates(s, from, 30);
    expect(dates).toHaveLength(1);
    expect(toYMD(dates[0])).toBe('2025-01-15');
    expect(dates[0].getHours()).toBe(10);
    expect(dates[0].getMinutes()).toBe(30);
  });

  it('returns 0 dates when the date is outside the window', () => {
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'once', date: '2025-03-01' };
    expect(computeFireDates(s, from, 30)).toHaveLength(0);
  });

  it('returns 0 when date is empty', () => {
    const from = localDay('2025-01-01');
    const s: Schedule = { ...BASE, type: 'once', date: '' };
    expect(computeFireDates(s, from, 30)).toHaveLength(0);
  });
});

// ─── aggregateMarkedDates ────────────────────────────────────────────────────

describe('aggregateMarkedDates', () => {
  it('returns an empty object when there are no schedules', () => {
    expect(aggregateMarkedDates([])).toEqual({});
  });

  it('produces one entry per firing day with a dot', () => {
    // We override computeFireDates indirectly by using a daily schedule
    // and counting keys — just validate structure
    const s: Schedule = { ...BASE, type: 'daily' };
    const result = aggregateMarkedDates([s], 3);
    const keys = Object.keys(result);
    expect(keys.length).toBe(3);
    keys.forEach((key) => {
      expect(result[key].dots.length).toBeGreaterThanOrEqual(1);
      expect(result[key].dots[0]).toHaveProperty('color');
    });
  });

  it('collapses multiple schedules for same zone into one dot per day', () => {
    const s1: Schedule = { ...BASE, id: 1, zone_id: 1, type: 'daily' };
    const s2: Schedule = { ...BASE, id: 2, zone_id: 1, type: 'daily' };
    const result = aggregateMarkedDates([s1, s2], 1);
    const keys = Object.keys(result);
    expect(keys.length).toBe(1);
    // Only one dot for zone 1, not two
    expect(result[keys[0]].dots).toHaveLength(1);
  });

  it('produces two dots when two different zones fire on the same day', () => {
    const s1: Schedule = { ...BASE, id: 1, zone_id: 1, type: 'daily' };
    const s2: Schedule = { ...BASE, id: 2, zone_id: 2, type: 'daily' };
    const result = aggregateMarkedDates([s1, s2], 1);
    const keys = Object.keys(result);
    expect(keys.length).toBe(1);
    expect(result[keys[0]].dots).toHaveLength(2);
  });
});

import {
  toggleDay,
  isDaySet,
  getDayLabels,
  toggleMonthDay,
  isMonthDaySet,
  getMonthDays,
} from '../maskUtils';

// ─── days_mask ────────────────────────────────────────────────────────────────

describe('toggleDay', () => {
  it('sets Sunday (bit 0) on an empty mask', () => {
    expect(toggleDay(0, 0)).toBe(1);
  });

  it('sets Saturday (bit 6) on an empty mask', () => {
    expect(toggleDay(0, 6)).toBe(64);
  });

  it('sets multiple days independently', () => {
    let mask = 0;
    mask = toggleDay(mask, 0); // Sun → 0b0000001 = 1
    mask = toggleDay(mask, 3); // Wed → 0b0001001 = 9
    expect(mask).toBe(9);
  });

  it('unsets a day that is already set', () => {
    const allDays = 0b1111111; // all 7 days set
    expect(toggleDay(allDays, 0)).toBe(0b1111110); // Sun unset
  });

  it('round-trips: toggle twice returns original mask', () => {
    const original = 0b0101010;
    expect(toggleDay(toggleDay(original, 2), 2)).toBe(original);
  });

  it('stays within uint8 bounds (bit 6 max)', () => {
    expect(toggleDay(0, 6)).toBeLessThanOrEqual(0xff);
  });
});

describe('isDaySet', () => {
  it('returns true when the day bit is set', () => {
    expect(isDaySet(1, 0)).toBe(true); // Sunday
    expect(isDaySet(64, 6)).toBe(true); // Saturday
  });

  it('returns false when the day bit is not set', () => {
    expect(isDaySet(0, 0)).toBe(false);
    expect(isDaySet(1, 1)).toBe(false); // Sunday set, Monday not
  });

  it('works correctly for all individual day bits', () => {
    for (let i = 0; i < 7; i++) {
      expect(isDaySet(1 << i, i)).toBe(true);
    }
  });
});

describe('getDayLabels', () => {
  it('returns empty array for empty mask', () => {
    expect(getDayLabels(0)).toEqual([]);
  });

  it('returns ["Sun", "Tue"] for mask = 5 (bits 0 and 2)', () => {
    // 5 = 0b00000101 → bit0 = Sun, bit2 = Tue
    expect(getDayLabels(5)).toEqual(['Sun', 'Tue']);
  });

  it('returns all days for full mask', () => {
    expect(getDayLabels(0b1111111)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('spec scenario: Sun + Wed → mask = 9 (0b0001001)', () => {
    // Sun=bit0=1, Wed=bit3=8 → 9
    expect(getDayLabels(9)).toEqual(['Sun', 'Wed']);
  });
});

// ─── month_mask ───────────────────────────────────────────────────────────────

describe('toggleMonthDay', () => {
  it('sets day 1 (bit 0)', () => {
    expect(toggleMonthDay(0, 1)).toBe(1);
  });

  it('sets day 15 (bit 14)', () => {
    expect(toggleMonthDay(0, 15)).toBe(1 << 14); // 16384
  });

  it('sets day 31 (bit 30)', () => {
    expect(toggleMonthDay(0, 31)).toBe(1 << 30); // 1073741824
  });

  it('unsets a day that is already set', () => {
    const mask = toggleMonthDay(0, 15); // set day 15
    expect(toggleMonthDay(mask, 15)).toBe(0);
  });

  it('round-trips: toggle twice returns original mask', () => {
    const original = (1 << 0) | (1 << 14); // days 1 and 15
    expect(toggleMonthDay(toggleMonthDay(original, 10), 10)).toBe(original);
  });

  it('returns unsigned integer (>>>0)', () => {
    // The result must be a non-negative number
    expect(toggleMonthDay(0, 31)).toBeGreaterThanOrEqual(0);
  });
});

describe('isMonthDaySet', () => {
  it('returns true when the day is set', () => {
    expect(isMonthDaySet(1, 1)).toBe(true); // day 1
    expect(isMonthDaySet(1 << 30, 31)).toBe(true); // day 31
  });

  it('returns false when the day is not set', () => {
    expect(isMonthDaySet(0, 1)).toBe(false);
    expect(isMonthDaySet(1, 2)).toBe(false); // day 1 set, day 2 not
  });

  it('spec scenario: month_mask = 16385 → days 1 and 15 set', () => {
    // 16385 = 1 (bit0, day1) + 16384 (bit14, day15)
    expect(isMonthDaySet(16385, 1)).toBe(true);
    expect(isMonthDaySet(16385, 15)).toBe(true);
    expect(isMonthDaySet(16385, 2)).toBe(false);
  });
});

describe('getMonthDays', () => {
  it('returns empty array for empty mask', () => {
    expect(getMonthDays(0)).toEqual([]);
  });

  it('returns [1] for mask = 1', () => {
    expect(getMonthDays(1)).toEqual([1]);
  });

  it('returns [1, 15] for mask = 16385', () => {
    // spec scenario: days 1 and 15 → month_mask = 16385
    expect(getMonthDays(16385)).toEqual([1, 15]);
  });

  it('returns [1, 15, 28] for combined mask', () => {
    const mask = toggleMonthDay(toggleMonthDay(toggleMonthDay(0, 1), 15), 28);
    expect(getMonthDays(mask)).toEqual([1, 15, 28]);
  });

  it('returns [31] for day 31 only', () => {
    expect(getMonthDays(1 << 30)).toEqual([31]);
  });

  it('returns days in ascending order (1–31)', () => {
    const mask = toggleMonthDay(toggleMonthDay(0, 20), 5);
    expect(getMonthDays(mask)).toEqual([5, 20]);
  });
});

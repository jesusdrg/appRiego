import { cmd, Schedule } from '../bleConstants';

const sampleSchedule: Schedule = {
  id: 1,
  zone_id: 1,
  hour: 8,
  minute: 0,
  duration: 300,
  type: 'daily',
  date: '',
  days_mask: 0,
  month_mask: 0,
  interval_days: 0,
  active: true,
};

describe('cmd builders', () => {
  describe('addSchedule', () => {
    test('output has field "type" matching the schedule type', () => {
      const result = cmd.addSchedule(sampleSchedule);
      expect(result).toHaveProperty('type', 'daily');
    });

    test('output does NOT have field "sched_type"', () => {
      const result = cmd.addSchedule(sampleSchedule);
      expect(result).not.toHaveProperty('sched_type');
    });

    test('spreads all schedule fields into the command', () => {
      const result = cmd.addSchedule(sampleSchedule);
      expect(result).toMatchObject({ command: 'add_schedule', id: 1, zone_id: 1, duration: 300 });
    });

    test('weekly: days_mask=9 (Sun+Wed) is preserved in command JSON', () => {
      // bit0=Sun=1, bit3=Wed=8 → 9
      const weekly: Schedule = { ...sampleSchedule, type: 'weekly', days_mask: 9 };
      const result = cmd.addSchedule(weekly);
      expect(result).toMatchObject({ command: 'add_schedule', type: 'weekly', days_mask: 9 });
      expect(result).not.toHaveProperty('sched_type');
    });

    test('monthly: month_mask=16385 (day1+day15) is preserved in command JSON', () => {
      // bit0=day1=1, bit14=day15=16384 → 16385
      const monthly: Schedule = { ...sampleSchedule, type: 'monthly', month_mask: 16385 };
      const result = cmd.addSchedule(monthly);
      expect(result).toMatchObject({ command: 'add_schedule', type: 'monthly', month_mask: 16385 });
    });

    test('interval: date field used as start-date anchor', () => {
      const interval: Schedule = { ...sampleSchedule, type: 'interval', date: '2026-07-01', interval_days: 3 };
      const result = cmd.addSchedule(interval);
      expect(result).toMatchObject({ command: 'add_schedule', type: 'interval', date: '2026-07-01', interval_days: 3 });
    });
  });

  describe('zoneOn', () => {
    test('includes zone_id and duration', () => {
      const result = cmd.zoneOn(2, 600);
      expect(result).toMatchObject({ command: 'zone_on', zone_id: 2, duration: 600 });
    });
  });

  describe('zoneOff', () => {
    test('includes zone_id', () => {
      const result = cmd.zoneOff(1);
      expect(result).toMatchObject({ command: 'zone_off', zone_id: 1 });
    });
  });

  describe('syncTime', () => {
    test('output has utc_timestamp as a positive number', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = cmd.syncTime();
      const after = Math.floor(Date.now() / 1000);
      expect(typeof result.utc_timestamp).toBe('number');
      expect(result.utc_timestamp).toBeGreaterThanOrEqual(before);
      expect(result.utc_timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('pumpOn / pumpOff', () => {
    test('pumpOn emits correct command', () => {
      expect(cmd.pumpOn()).toEqual({ command: 'pump_on' });
    });

    test('pumpOff emits correct command', () => {
      expect(cmd.pumpOff()).toEqual({ command: 'pump_off' });
    });
  });
});

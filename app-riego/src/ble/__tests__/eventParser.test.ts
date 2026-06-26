import { parseEvent } from '../eventParser';

function encode(obj: object): string {
  return btoa(JSON.stringify(obj));
}

const baseScheduleFields = {
  id: 1,
  zone_id: 1,
  hour: 8,
  minute: 0,
  duration: 300,
  date: '',
  days_mask: 0,
  month_mask: 0,
  interval_days: 0,
  active: true,
};

describe('parseEvent — schedule_item', () => {
  test('sched_type "daily" → parsed event item.type is "daily" (not "sched_type")', () => {
    const b64 = encode({ type: 'schedule_item', ...baseScheduleFields, sched_type: 'daily' });
    const result = parseEvent(b64);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('schedule_item');
    if (result?.type === 'schedule_item') {
      expect(result.item.type).toBe('daily');
      expect('sched_type' in result.item).toBe(false);
    }
  });

  test('sched_type "weekly" → parsed event item.type is "weekly"', () => {
    const b64 = encode({
      type: 'schedule_item',
      ...baseScheduleFields,
      id: 2,
      zone_id: 2,
      sched_type: 'weekly',
      days_mask: 0b1000001,
    });
    const result = parseEvent(b64);
    expect(result?.type).toBe('schedule_item');
    if (result?.type === 'schedule_item') {
      expect(result.item.type).toBe('weekly');
    }
  });

  test('missing sched_type → defaults to "daily"', () => {
    const b64 = encode({ type: 'schedule_item', ...baseScheduleFields });
    const result = parseEvent(b64);
    if (result?.type === 'schedule_item') {
      expect(result.item.type).toBe('daily');
    }
  });
});

describe('parseEvent — system_status', () => {
  test('system_status event is parsed correctly', () => {
    const b64 = encode({
      type: 'system_status',
      zone1_active: true,
      zone2_active: false,
      pump_active: true,
      pump_manual: false,
      time_synced: true,
      auto_mode: true,
      schedule_count: 3,
      local_time: '2024-01-01 08:00:00',
      uptime: 3661000,
    });
    const result = parseEvent(b64);
    expect(result?.type).toBe('system_status');
    if (result?.type === 'system_status') {
      expect(result.zone1_active).toBe(true);
      expect(result.zone2_active).toBe(false);
      expect(result.pump_active).toBe(true);
      expect(result.schedule_count).toBe(3);
      expect(result.auto_mode).toBe(true);
      expect(result.uptime).toBe(3661000);
      expect(result.local_time).toBe('2024-01-01 08:00:00');
    }
  });
});

describe('parseEvent — error handling', () => {
  test('invalid base64 → returns null without throwing', () => {
    expect(() => parseEvent('not-valid-base64!!!')).not.toThrow();
    expect(parseEvent('not-valid-base64!!!')).toBeNull();
  });

  test('valid base64 but invalid JSON → returns null without throwing', () => {
    expect(() => parseEvent(btoa('{not valid json'))).not.toThrow();
    expect(parseEvent(btoa('{not valid json'))).toBeNull();
  });

  test('valid JSON but missing type field → returns null', () => {
    const b64 = encode({ zone1_active: true });
    expect(parseEvent(b64)).toBeNull();
  });

  test('unknown event type → returns null', () => {
    const b64 = encode({ type: 'unknown_event', foo: 'bar' });
    expect(parseEvent(b64)).toBeNull();
  });
});

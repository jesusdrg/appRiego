import { useIrrigationStore } from '../../stores/useIrrigationStore';
import { Schedule } from '../bleConstants';

const makeSchedule = (id: number): Schedule => ({
  id,
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
});

beforeEach(() => {
  // Reset store state before each test
  useIrrigationStore.setState({ schedules: [] });
});

describe('useIrrigationStore — setSchedules', () => {
  test('replaces the schedule list with the provided array', () => {
    const schedules = [makeSchedule(1), makeSchedule(2)];
    useIrrigationStore.getState().setSchedules(schedules);
    const stored = useIrrigationStore.getState().schedules;
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe(1);
    expect(stored[1].id).toBe(2);
  });

  test('replaces existing schedules (not appends)', () => {
    useIrrigationStore.getState().setSchedules([makeSchedule(1)]);
    useIrrigationStore.getState().setSchedules([makeSchedule(99)]);
    const stored = useIrrigationStore.getState().schedules;
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(99);
  });

  test('setting an empty list clears all schedules', () => {
    useIrrigationStore.getState().setSchedules([makeSchedule(1), makeSchedule(2)]);
    useIrrigationStore.getState().setSchedules([]);
    expect(useIrrigationStore.getState().schedules).toHaveLength(0);
  });
});

describe('useIrrigationStore — nextScheduleId', () => {
  test('returns max(existing ids) + 1 when schedules are present', () => {
    useIrrigationStore.getState().setSchedules([makeSchedule(5), makeSchedule(10), makeSchedule(3)]);
    expect(useIrrigationStore.getState().nextScheduleId()).toBe(11);
  });

  test('returns max+1 even with a single schedule', () => {
    useIrrigationStore.getState().setSchedules([makeSchedule(7)]);
    expect(useIrrigationStore.getState().nextScheduleId()).toBe(8);
  });

  test('falls back to Date.now() (a large timestamp) when the list is empty', () => {
    const before = Date.now();
    const id = useIrrigationStore.getState().nextScheduleId();
    const after = Date.now();
    // Date.now() returns milliseconds — significantly larger than any schedule id
    expect(id).toBeGreaterThanOrEqual(before);
    expect(id).toBeLessThanOrEqual(after);
  });
});

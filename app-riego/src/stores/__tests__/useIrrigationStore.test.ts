import { useIrrigationStore } from '../useIrrigationStore';
import { LogEntry } from '../../ble/bleConstants';

function makeEntry(ts: number): LogEntry {
  return { ts, level: 'event', message: `msg-${ts}` };
}

describe('useIrrigationStore — appendLog', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useIrrigationStore.setState({ log: [] });
  });

  it('prepends new entries so the newest is at index 0', () => {
    const { appendLog } = useIrrigationStore.getState();
    appendLog(makeEntry(1));
    appendLog(makeEntry(2));
    appendLog(makeEntry(3));
    const { log } = useIrrigationStore.getState();
    expect(log[0].ts).toBe(3);
    expect(log[1].ts).toBe(2);
    expect(log[2].ts).toBe(1);
  });

  it('caps the log at 100 entries', () => {
    const { appendLog } = useIrrigationStore.getState();
    for (let i = 1; i <= 101; i++) {
      appendLog(makeEntry(i));
    }
    const { log } = useIrrigationStore.getState();
    expect(log.length).toBe(100);
  });

  it('keeps the newest entry at index 0 after exceeding the cap', () => {
    const { appendLog } = useIrrigationStore.getState();
    for (let i = 1; i <= 101; i++) {
      appendLog(makeEntry(i));
    }
    const { log } = useIrrigationStore.getState();
    // Entry 101 was appended last — it should be at index 0
    expect(log[0].ts).toBe(101);
    // The oldest entry (ts=1) should have been dropped
    expect(log.find((e) => e.ts === 1)).toBeUndefined();
  });
});

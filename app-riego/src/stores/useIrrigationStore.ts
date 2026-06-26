import { create } from 'zustand';
import { Schedule, ZoneState, SystemStatus, LogEntry } from '../ble/bleConstants';

const LOG_MAX_ENTRIES = 100;

interface IrrigationStore {
  pump: boolean;
  pumpManual: boolean;
  zones: { 1: ZoneState; 2: ZoneState };
  systemStatus: SystemStatus | null;
  schedules: Schedule[];
  log: LogEntry[];

  applySystemStatus: (s: SystemStatus) => void;
  setZone: (id: number, active: boolean) => void;
  setPump: (active: boolean, manual?: boolean) => void;
  appendLog: (entry: LogEntry) => void;
  setSchedules: (schedules: Schedule[]) => void;

  /**
   * Assign a unique non-zero schedule ID.
   * Uses max(existing ids) + 1; falls back to Date.now() when list is empty.
   */
  nextScheduleId: () => number;
}

export const useIrrigationStore = create<IrrigationStore>((set, get) => ({
  pump: false,
  pumpManual: false,
  zones: {
    1: { active: false },
    2: { active: false },
  },
  systemStatus: null,
  schedules: [],
  log: [],

  applySystemStatus: (s: SystemStatus) => {
    set({
      systemStatus: s,
      pump: s.pump_active,
      pumpManual: s.pump_manual,
      zones: {
        1: { active: s.zone1_active },
        2: { active: s.zone2_active },
      },
    });
  },

  setZone: (id: number, active: boolean) => {
    set((state) => ({
      zones: {
        ...state.zones,
        [id]: { active },
      },
    }));
  },

  setPump: (active: boolean, manual?: boolean) => {
    set((state) => ({
      pump: active,
      pumpManual: manual !== undefined ? manual : state.pumpManual,
    }));
  },

  appendLog: (entry: LogEntry) => {
    set((state) => {
      // Prepend newest entry; cap at LOG_MAX_ENTRIES
      const updated = [entry, ...state.log];
      return { log: updated.length > LOG_MAX_ENTRIES ? updated.slice(0, LOG_MAX_ENTRIES) : updated };
    });
  },

  setSchedules: (schedules: Schedule[]) => {
    set({ schedules });
  },

  nextScheduleId: () => {
    const { schedules } = get();
    if (schedules.length === 0) {
      return Date.now();
    }
    const maxId = Math.max(...schedules.map((s) => s.id));
    return maxId + 1;
  },
}));

import { create } from 'zustand';

export type BleStatus = 'idle' | 'scanning' | 'connected' | 'disconnected';

interface BleStore {
  status: BleStatus;
  deviceId: string | null;

  setStatus: (status: BleStatus) => void;
  setDevice: (id: string | null) => void;

  // Convenience actions — delegate to bleService to keep the store transport-agnostic
  connect: () => void;
  disconnect: () => void;
}

export const useBleStore = create<BleStore>((set) => ({
  status: 'idle',
  deviceId: null,

  setStatus: (status) => set({ status }),
  setDevice: (deviceId) => set({ deviceId }),

  connect: () => {
    // Lazy import to avoid circular dependency between store and BleService
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bleService } = require('../ble/BleService');
    bleService.connect();
  },

  disconnect: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bleService } = require('../ble/BleService');
    bleService.disconnect();
  },
}));

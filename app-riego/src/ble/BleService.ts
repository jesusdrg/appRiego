import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { cmd, Schedule, SystemStatus, SERVICE_UUID, COMMAND_CHAR, STATUS_CHAR, DEVICE_NAME } from './bleConstants';
import { parseEvent } from './eventParser';

// Stores are imported lazily to avoid circular deps at module load time
let useBleStore: typeof import('../stores/useBleStore').useBleStore;
let useIrrigationStore: typeof import('../stores/useIrrigationStore').useIrrigationStore;

const RECONNECT_DELAY_MS = 2000;
const SCHEDULE_ACCUMULATION_TIMEOUT_MS = 5000;

class BleService {
  private manager: BleManager | null = null;
  private device: Device | null = null;
  private notifySubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;

  // Schedule accumulation buffer
  private pendingSchedules: Schedule[] = [];
  private expectedCount = 0;
  private accumulationTimer: ReturnType<typeof setTimeout> | null = null;

  // Scan timeout timer — stored so it can be cancelled when device connects early
  private scanTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private initialized = false;

  /**
   * Must be called once at app startup (in _layout.tsx).
   * Creates the BleManager and imports stores.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.manager = new BleManager();

    // Lazy import stores after init to avoid circular reference issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    useBleStore = require('../stores/useBleStore').useBleStore;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    useIrrigationStore = require('../stores/useIrrigationStore').useIrrigationStore;
  }

  /**
   * Start scanning for RiegoESP32. On discovery, auto-connect.
   * Sets store status: scanning → connected (or disconnected on failure).
   */
  async connect(): Promise<void> {
    if (!this.manager) {
      console.warn('[BleService] Not initialized. Call init() first.');
      return;
    }

    const { setStatus, setDevice } = useBleStore.getState();
    setStatus('scanning');

    this.manager.startDeviceScan(
      [SERVICE_UUID],
      { allowDuplicates: false },
      async (error, device) => {
        if (error) {
          console.error('[BleService] Scan error:', error.message);
          setStatus('disconnected');
          return;
        }

        if (!device || device.name !== DEVICE_NAME) return;

        // Found our device — stop scan and connect
        this.manager?.stopDeviceScan();

        try {
          await this.connectToDevice(device);
        } catch (connectError) {
          console.error('[BleService] Connection error:', connectError);
          setStatus('disconnected');
        }
      },
    );

    // 15-second scan timeout — timer stored so connectToDevice can cancel it on early connect
    this.scanTimeoutTimer = setTimeout(() => {
      this.scanTimeoutTimer = null;
      if (useBleStore.getState().status === 'scanning') {
        this.manager?.stopDeviceScan();
        setStatus('disconnected');
      }
    }, 15000);
  }

  private async connectToDevice(device: Device): Promise<void> {
    // Cancel the scan timeout — we found the device before it fired
    if (this.scanTimeoutTimer !== null) {
      clearTimeout(this.scanTimeoutTimer);
      this.scanTimeoutTimer = null;
    }

    const { setStatus, setDevice } = useBleStore.getState();

    const connected = await device.connect({ requestMTU: 247 });
    const discovered = await connected.discoverAllServicesAndCharacteristics();

    this.device = discovered;
    setDevice(discovered.id);
    setStatus('connected');

    // Monitor for disconnect
    this.disconnectSubscription = discovered.onDisconnected((_error, _dev) => {
      this.onDisconnect();
    });

    // Subscribe to STATUS_CHAR notifications before sending any commands
    this.notifySubscription = discovered.monitorCharacteristicForService(
      SERVICE_UUID,
      STATUS_CHAR,
      (error, characteristic) => {
        if (error) {
          console.error('[BleService] Notify error:', error.message);
          return;
        }
        if (characteristic?.value) {
          this.onNotify(characteristic.value);
        }
      },
    );

    // Protocol sequence: subscribe (done above) → sync_time → get_status
    await this.sendCommand(cmd.syncTime());
    await this.sendCommand(cmd.getStatus());
  }

  /**
   * Disconnect from current device and reset state.
   */
  async disconnect(): Promise<void> {
    this.cleanup();
    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch {
        // Ignore disconnect errors
      }
      this.device = null;
    }
    useBleStore.getState().setStatus('idle');
    useBleStore.getState().setDevice(null);
  }

  /**
   * Serialize a command object to JSON→base64 and write to COMMAND_CHAR.
   * Uses WRITE_NO_RESPONSE to match firmware characteristic property.
   */
  async sendCommand(obj: object): Promise<void> {
    if (!this.device) {
      console.warn('[BleService] No connected device. Cannot send command.');
      return;
    }

    const json = JSON.stringify(obj);
    const base64 = btoa(json);

    try {
      await this.device.writeCharacteristicWithoutResponseForService(
        SERVICE_UUID,
        COMMAND_CHAR,
        base64,
      );
    } catch (error) {
      console.error('[BleService] sendCommand error:', error);
    }
  }

  // ─── Internal notify dispatcher ─────────────────────────────────────────────

  private onNotify(base64Value: string): void {
    const event = parseEvent(base64Value);
    if (!event) return;

    const irrigationStore = useIrrigationStore.getState();

    switch (event.type) {
      case 'system_status':
        this.onSystemStatus(event);
        irrigationStore.applySystemStatus(event);
        break;

      case 'schedule_item':
        this.onScheduleItem(event.item);
        break;

      case 'zone_status':
        irrigationStore.setZone(event.zone_id, event.active);
        break;

      case 'pump_status':
        irrigationStore.setPump(event.active);
        break;

      case 'schedule_start':
        irrigationStore.appendLog({
          ts: Date.now(),
          level: 'event',
          message: `Schedule started: zone ${event.zone_id}, duration ${event.duration}s`,
        });
        break;

      case 'schedule_complete':
        irrigationStore.appendLog({
          ts: Date.now(),
          level: 'event',
          message: `Schedule complete: zone ${event.zone_id}, duration ${event.duration}s`,
        });
        break;

      case 'log_entry':
        irrigationStore.appendLog({
          ts: Date.now(),
          level: 'info',
          message: event.message,
        });
        break;

      case 'error':
        irrigationStore.appendLog({
          ts: Date.now(),
          level: 'error',
          message: event.message,
        });
        break;
    }
  }

  private onSystemStatus(s: SystemStatus): void {
    // Reset accumulation buffer whenever a new system_status arrives
    this.clearAccumulationTimer();
    this.pendingSchedules = [];
    this.expectedCount = s.schedule_count;

    // Arm the 5-second commit timeout for schedule_item accumulation
    if (this.expectedCount > 0) {
      this.accumulationTimer = setTimeout(() => {
        this.commitSchedules();
      }, SCHEDULE_ACCUMULATION_TIMEOUT_MS);
    } else {
      // No schedules expected — commit empty list immediately
      useIrrigationStore.getState().setSchedules([]);
    }
  }

  private onScheduleItem(s: Schedule): void {
    this.pendingSchedules.push(s);

    if (this.pendingSchedules.length >= this.expectedCount && this.expectedCount > 0) {
      // All expected items received — commit now
      this.clearAccumulationTimer();
      this.commitSchedules();
    }
    // else: wait for more items or timeout
  }

  private commitSchedules(): void {
    useIrrigationStore.getState().setSchedules([...this.pendingSchedules]);
    this.pendingSchedules = [];
    this.expectedCount = 0;
  }

  private clearAccumulationTimer(): void {
    if (this.accumulationTimer !== null) {
      clearTimeout(this.accumulationTimer);
      this.accumulationTimer = null;
    }
  }

  // ─── Disconnect / reconnect ──────────────────────────────────────────────────

  private onDisconnect(): void {
    this.cleanup();
    this.device = null;

    const { setStatus, setDevice } = useBleStore.getState();
    setStatus('disconnected');
    setDevice(null);

    // Reconnect after 2-second delay
    setTimeout(() => {
      const currentStatus = useBleStore.getState().status;
      if (currentStatus === 'disconnected') {
        this.connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private cleanup(): void {
    this.clearAccumulationTimer();
    this.pendingSchedules = [];
    this.expectedCount = 0;

    if (this.notifySubscription) {
      this.notifySubscription.remove();
      this.notifySubscription = null;
    }
    if (this.disconnectSubscription) {
      this.disconnectSubscription.remove();
      this.disconnectSubscription = null;
    }
  }
}

// Singleton instance — one BleManager, one subscription, shared across the app
export const bleService = new BleService();

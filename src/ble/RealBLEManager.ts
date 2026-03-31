import {BleManager, Device, BleError, State} from 'react-native-ble-plx';
import {Buffer} from 'buffer';
import {IBLEManager, DeviceInfo, Threat} from './types';
import {parseRadarPacket} from './parseRadarPacket';
import {useRadarStore} from './radarStore';
import {ConnectionStatus} from './types';

/**
 * Varia RTL515 BLE UUIDs (confirmed via pycycling / harbour-tacho community research)
 * Service: 6A4E3200-667B-11E3-949A-0800200C9A66
 * Radar characteristic: 6A4E3203-667B-11E3-949A-0800200C9A66
 * Battery service: 0x180F (standard BLE)
 * Battery characteristic: 0x2A19 (standard BLE)
 */
const RADAR_SERVICE_UUID = '6A4E3200-667B-11E3-949A-0800200C9A66';
const RADAR_CHAR_UUID = '6A4E3203-667B-11E3-949A-0800200C9A66';
const BATTERY_SERVICE_UUID = '0000180F-0000-1000-8000-00805F9B34FB';
const BATTERY_CHAR_UUID = '00002A19-0000-1000-8000-00805F9B34FB';

/** RTL device name prefix filter */
const RTL_PREFIX = 'RTL';

/** Scan duration before returning discovered devices */
const SCAN_DURATION_MS = 10000;

/** Reconnect intervals: every 3s for the first 60s, then every 10s indefinitely */
const RECONNECT_FAST_INTERVAL_MS = 3000;
const RECONNECT_FAST_DURATION_MS = 60000;
const RECONNECT_SLOW_INTERVAL_MS = 10000;

export class RealBLEManager implements IBLEManager {
  private bleManager: BleManager;
  private connectedDeviceId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectStartTime = 0;
  private radarSubscription: {remove: () => void} | null = null;
  private batterySubscription: {remove: () => void} | null = null;
  private disconnectSubscription: {remove: () => void} | null = null;
  private onThreats: ((threats: Threat[]) => void) | null = null;

  constructor() {
    this.bleManager = new BleManager();
  }

  // ---------------------------------------------------------------------------
  // IBLEManager — scan
  // ---------------------------------------------------------------------------

  async scan(): Promise<DeviceInfo[]> {
    const discovered = new Map<string, DeviceInfo>();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager.stopDeviceScan();
        resolve(Array.from(discovered.values()));
      }, SCAN_DURATION_MS);

      this.bleManager.startDeviceScan(
        null, // all services
        {allowDuplicates: false},
        (error: BleError | null, device: Device | null) => {
          if (error) {
            clearTimeout(timeout);
            this.bleManager.stopDeviceScan();
            reject(error);
            return;
          }
          if (device && device.name?.startsWith(RTL_PREFIX)) {
            discovered.set(device.id, {
              id: device.id,
              name: device.name ?? device.id,
              rssi: device.rssi ?? -99,
            });
          }
        },
      );
    });
  }

  // ---------------------------------------------------------------------------
  // IBLEManager — connect
  // ---------------------------------------------------------------------------

  async connect(deviceId: string): Promise<void> {
    const {setConnectionStatus, setConnectedDevice, resetFailures, incrementFailures} =
      useRadarStore.getState();

    setConnectionStatus(ConnectionStatus.Connecting);

    try {
      const device = await this.bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      // Verify radar service is present
      const services = await device.services();
      const hasRadar = services.some(
        s => s.uuid.toUpperCase() === RADAR_SERVICE_UUID.toUpperCase(),
      );
      if (!hasRadar) {
        // Service not found — treat as failure (likely conflict with Garmin app)
        await this.bleManager.cancelDeviceConnection(deviceId);
        incrementFailures();
        throw new Error('Radar BLE service not found — another app may be connected');
      }

      this.connectedDeviceId = deviceId;
      resetFailures();
      setConnectionStatus(ConnectionStatus.Connected);
      setConnectedDevice({id: device.id, name: device.name ?? device.id, rssi: device.rssi ?? -99});

      this._subscribeToRadar(device);
      this._subscribeToDisconnect(device);
      await this._readBattery(deviceId);
      this._subscribeToBattery(deviceId);
    } catch (err) {
      setConnectionStatus(ConnectionStatus.Disconnected);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // IBLEManager — disconnect
  // ---------------------------------------------------------------------------

  async disconnect(): Promise<void> {
    this._cancelReconnect();
    this._unsubscribeAll();
    if (this.connectedDeviceId) {
      try {
        await this.bleManager.cancelDeviceConnection(this.connectedDeviceId);
      } catch {
        // Ignore — device may already be disconnected
      }
      this.connectedDeviceId = null;
    }
    useRadarStore.getState().setConnectionStatus(ConnectionStatus.Disconnected);
    useRadarStore.getState().setConnectedDevice(null);
  }

  // ---------------------------------------------------------------------------
  // IBLEManager — subscribe (optional callback for threat updates)
  // ---------------------------------------------------------------------------

  subscribe(callback: (threats: Threat[], batteryLevel: number | null) => void): () => void {
    this.onThreats = (threats: Threat[]) => {
      callback(threats, useRadarStore.getState().batteryLevel);
    };
    return () => {
      this.onThreats = null;
    };
  }

  // ---------------------------------------------------------------------------
  // Reconnect loop
  // ---------------------------------------------------------------------------

  startReconnectLoop(deviceId: string): void {
    const {setConnectionStatus} = useRadarStore.getState();
    setConnectionStatus(ConnectionStatus.Reconnecting);
    this.reconnectStartTime = Date.now();
    this._scheduleReconnect(deviceId);
  }

  private _scheduleReconnect(deviceId: string): void {
    this._cancelReconnect();
    const elapsed = Date.now() - this.reconnectStartTime;
    const interval =
      elapsed < RECONNECT_FAST_DURATION_MS
        ? RECONNECT_FAST_INTERVAL_MS
        : RECONNECT_SLOW_INTERVAL_MS;

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(deviceId);
        // connect() sets status to Connected on success
      } catch {
        // Still disconnected — schedule next attempt
        this._scheduleReconnect(deviceId);
      }
    }, interval);
  }

  private _cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Bluetooth state monitoring (toggle off/on recovery)
  // ---------------------------------------------------------------------------

  watchBluetoothState(deviceId: string): () => void {
    const sub = this.bleManager.onStateChange((state: State) => {
      if (state === State.PoweredOn && this.connectedDeviceId === null) {
        this.startReconnectLoop(deviceId);
      }
    }, true);
    return () => sub.remove();
  }

  // ---------------------------------------------------------------------------
  // Private — characteristic subscriptions
  // ---------------------------------------------------------------------------

  private _subscribeToRadar(device: Device): void {
    this.radarSubscription = device.monitorCharacteristicForService(
      RADAR_SERVICE_UUID,
      RADAR_CHAR_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) {
          return;
        }
        const bytes = new Uint8Array(Buffer.from(characteristic.value, 'base64'));
        const packet = parseRadarPacket(bytes);
        const threats = packet?.threats ?? [];
        useRadarStore.getState().setThreats(threats);
        this.onThreats?.(threats);
      },
    );
  }

  private _subscribeToDisconnect(device: Device): void {
    this.disconnectSubscription = this.bleManager.onDeviceDisconnected(
      device.id,
      (_error, _disconnectedDevice) => {
        this._unsubscribeAll();
        this.connectedDeviceId = null;
        useRadarStore.getState().setConnectionStatus(ConnectionStatus.Reconnecting);
        useRadarStore.getState().setConnectedDevice(null);
        useRadarStore.getState().setThreats([]);
        this.startReconnectLoop(device.id);
      },
    );
  }

  private async _readBattery(deviceId: string): Promise<void> {
    try {
      const char = await this.bleManager.readCharacteristicForDevice(
        deviceId,
        BATTERY_SERVICE_UUID,
        BATTERY_CHAR_UUID,
      );
      if (char.value) {
        const bytes = new Uint8Array(Buffer.from(char.value, 'base64'));
        useRadarStore.getState().setBatteryLevel(bytes[0]);
      }
    } catch {
      // Battery characteristic absent — batteryLevel stays null (bar hidden per REQ-VIS-004)
    }
  }

  private _subscribeToBattery(deviceId: string): void {
    this.batterySubscription = this.bleManager.monitorCharacteristicForDevice(
      deviceId,
      BATTERY_SERVICE_UUID,
      BATTERY_CHAR_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) {
          // Transient failure — hold last known value (do not update store)
          return;
        }
        const bytes = new Uint8Array(Buffer.from(characteristic.value, 'base64'));
        useRadarStore.getState().setBatteryLevel(bytes[0]);
      },
    );
  }

  private _unsubscribeAll(): void {
    this.radarSubscription?.remove();
    this.batterySubscription?.remove();
    this.disconnectSubscription?.remove();
    this.radarSubscription = null;
    this.batterySubscription = null;
    this.disconnectSubscription = null;
  }

  destroy(): void {
    this._cancelReconnect();
    this._unsubscribeAll();
    this.bleManager.destroy();
  }
}

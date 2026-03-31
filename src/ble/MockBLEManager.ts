import {IBLEManager, DeviceInfo, Threat, ThreatLevel} from './types';

/**
 * MockBLEManager — implements IBLEManager for unit and integration testing.
 * Emit fake devices and packets without any native BLE stack.
 */
export class MockBLEManager implements IBLEManager {
  private _scanDevices: DeviceInfo[] = [];
  private _connectShouldFail = false;
  private _subscribers: Array<(threats: Threat[], batteryLevel: number | null) => void> = [];
  private _batteryLevel: number | null = 100;

  // --- Test control API ---

  setScanDevices(devices: DeviceInfo[]): void {
    this._scanDevices = devices;
  }

  setConnectShouldFail(fail: boolean): void {
    this._connectShouldFail = fail;
  }

  setBatteryLevel(level: number | null): void {
    this._batteryLevel = level;
  }

  emitThreats(threats: Threat[]): void {
    this._subscribers.forEach(cb => cb(threats, this._batteryLevel));
  }

  // --- Demo mode threats (Varia: hold power 6s) ---
  emitDemoThreats(): void {
    const demoThreats: Threat[] = [
      {speed: 14, distance: 120, level: ThreatLevel.Medium},
      {speed: 22, distance: 40, level: ThreatLevel.High},
    ];
    this.emitThreats(demoThreats);
  }

  // --- IBLEManager implementation ---

  async scan(): Promise<DeviceInfo[]> {
    return this._scanDevices;
  }

  async connect(deviceId: string): Promise<void> {
    if (this._connectShouldFail) {
      throw new Error(`MockBLEManager: connect failed for ${deviceId}`);
    }
  }

  async disconnect(): Promise<void> {}

  subscribe(callback: (threats: Threat[], batteryLevel: number | null) => void): () => void {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter(cb => cb !== callback);
    };
  }
}

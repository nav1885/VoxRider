export enum ThreatLevel {
  None = 0,
  Medium = 1,
  High = 2,
  Unknown = 3,
}

export interface Threat {
  vehicleId?: number; // uint8 — persistent ID assigned by Varia per detected vehicle
  speed: number;      // uint8 km/h (bits 7-6 encode threat level)
  distance: number;   // uint8 meters
  level: ThreatLevel;
}

export interface RadarPacket {
  sequenceId: number; // upper nibble of byte 0
  threats: Threat[];
}

export interface DeviceInfo {
  id: string; // BLE device UUID
  name: string; // e.g. "RTL64894"
  rssi: number; // signal strength (negative dBm, closer to 0 = stronger)
  lastConnectedAt?: number; // unix timestamp ms
}

export enum ConnectionStatus {
  Disconnected = 'disconnected',
  Scanning = 'scanning',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

export interface IBLEManager {
  scan(): Promise<DeviceInfo[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(callback: (threats: Threat[], batteryLevel: number | null) => void): () => void;
}

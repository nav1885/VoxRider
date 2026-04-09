import {create} from 'zustand';
import {Threat, ConnectionStatus, DeviceInfo} from './types';

interface RadarState {
  threats: Threat[];
  connectionStatus: ConnectionStatus;
  connectedDevice: DeviceInfo | null;
  batteryLevel: number | null; // null = never received this session
  consecutiveFailures: number;

  setThreats: (threats: Threat[]) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setConnectedDevice: (device: DeviceInfo | null) => void;
  setBatteryLevel: (level: number) => void;
  incrementFailures: () => void;
  resetFailures: () => void;
}

export const useRadarStore = create<RadarState>(set => ({
  threats: [],
  connectionStatus: ConnectionStatus.Disconnected,
  connectedDevice: null,
  batteryLevel: null,
  consecutiveFailures: 0,

  setThreats: threats => set({threats}),
  setConnectionStatus: connectionStatus => set({connectionStatus}),
  setConnectedDevice: connectedDevice => set({connectedDevice}),
  setBatteryLevel: level => set({batteryLevel: level}),
  incrementFailures: () => set(s => ({consecutiveFailures: s.consecutiveFailures + 1})),
  resetFailures: () => set({consecutiveFailures: 0}),
}));

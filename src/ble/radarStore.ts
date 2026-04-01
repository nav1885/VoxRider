import {create} from 'zustand';
import {Threat, ConnectionStatus, DeviceInfo} from './types';

interface RadarState {
  threats: Threat[];
  connectionStatus: ConnectionStatus;
  connectedDevice: DeviceInfo | null;
  batteryLevel: number | null; // null = never received this session
  consecutiveFailures: number;
  debugLastAnnouncement: string;
  debugTTSLog: string;

  setThreats: (threats: Threat[]) => void;
  setDebugLastAnnouncement: (text: string) => void;
  setDebugTTSLog: (text: string) => void;
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
  debugLastAnnouncement: '',
  debugTTSLog: '',

  setThreats: threats => set({threats}),
  setDebugLastAnnouncement: text => set({debugLastAnnouncement: text}),
  setDebugTTSLog: text => set({debugTTSLog: text}),
  setConnectionStatus: connectionStatus => set({connectionStatus}),
  setConnectedDevice: connectedDevice => set({connectedDevice}),
  setBatteryLevel: level => set({batteryLevel: level}),
  incrementFailures: () => set(s => ({consecutiveFailures: s.consecutiveFailures + 1})),
  resetFailures: () => set({consecutiveFailures: 0}),
}));

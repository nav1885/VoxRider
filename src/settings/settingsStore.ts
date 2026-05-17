import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AlertVerbosity} from '../alerts/types';
import {DeviceInfo} from '../ble/types';
import {Units, TrafficMode} from './types';

const STORAGE_KEY = '@voxrider_settings';

interface SettingsState {
  verbosity: AlertVerbosity;
  units: Units;
  pairedDevices: DeviceInfo[];
  debugMode: boolean;
  trafficMode: TrafficMode;
  voiceId: string | null;
  sidebarPosition: 'left' | 'right';

  setVerbosity: (v: AlertVerbosity) => void;
  setUnits: (u: Units) => void;
  setDebugMode: (on: boolean) => void;
  setTrafficMode: (mode: TrafficMode) => void;
  setVoiceId: (id: string | null) => void;
  setSidebarPosition: (pos: 'left' | 'right') => void;
  addPairedDevice: (device: DeviceInfo) => void;
  removePairedDevice: (deviceId: string) => void;
  updateLastConnected: (deviceId: string) => void;
  loadFromStorage: () => Promise<void>;
  _persist: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  verbosity: AlertVerbosity.Minimal,
  units: 'imperial',
  pairedDevices: [],
  debugMode: false,
  trafficMode: 'quiet', // debug-only — intentionally not persisted, resets to quiet on restart
  voiceId: null,
  sidebarPosition: 'left',

  setDebugMode: on => {
    set({debugMode: on});
    get()._persist();
  },
  setTrafficMode: mode => {
    set({trafficMode: mode});
  },
  setVerbosity: v => {
    set({verbosity: v});
    get()._persist();
  },
  setUnits: u => {
    set({units: u});
    get()._persist();
  },
  setVoiceId: id => {
    set({voiceId: id});
    get()._persist();
  },
  setSidebarPosition: pos => {
    set({sidebarPosition: pos});
    get()._persist();
  },
  addPairedDevice: device => {
    set(s => ({
      pairedDevices: s.pairedDevices.some(d => d.id === device.id)
        ? s.pairedDevices
        : [...s.pairedDevices, device],
    }));
    get()._persist();
  },
  removePairedDevice: deviceId => {
    set(s => ({pairedDevices: s.pairedDevices.filter(d => d.id !== deviceId)}));
    get()._persist();
  },
  updateLastConnected: deviceId => {
    set(s => ({
      pairedDevices: s.pairedDevices.map(d =>
        d.id === deviceId ? {...d, lastConnectedAt: Date.now()} : d,
      ),
    }));
    get()._persist();
  },

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({
          verbosity: saved.verbosity ?? AlertVerbosity.Minimal,
          units: saved.units ?? 'imperial',
          pairedDevices: saved.pairedDevices ?? [],
          voiceId: saved.voiceId ?? null,
          debugMode: saved.debugMode ?? false,
          sidebarPosition: saved.sidebarPosition ?? 'left',
        });
      }
    } catch {}
  },

  _persist: async () => {
    try {
      const {verbosity, units, pairedDevices, voiceId, debugMode, sidebarPosition} = get();
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({verbosity, units, pairedDevices, voiceId, debugMode, sidebarPosition}),
      );
    } catch {}
  },
}));

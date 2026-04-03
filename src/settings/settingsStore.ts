import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AlertVerbosity} from '../alerts/types';
import {DeviceInfo} from '../ble/types';
import {Units} from './types';

const STORAGE_KEY = '@voxrider_settings';

interface SettingsState {
  verbosity: AlertVerbosity;
  units: Units;
  pairedDevices: DeviceInfo[];
  debugMode: boolean;
  voiceId: string | null;

  setVerbosity: (v: AlertVerbosity) => void;
  setUnits: (u: Units) => void;
  setDebugMode: (on: boolean) => void;
  setVoiceId: (id: string | null) => void;
  addPairedDevice: (device: DeviceInfo) => void;
  removePairedDevice: (deviceId: string) => void;
  updateLastConnected: (deviceId: string) => void;
  loadFromStorage: () => Promise<void>;
  _persist: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  verbosity: AlertVerbosity.Detailed,
  units: 'imperial',
  pairedDevices: [],
  debugMode: false,
  voiceId: null,

  setDebugMode: on => {
    set({debugMode: on});
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
          verbosity: saved.verbosity ?? AlertVerbosity.Detailed,
          units: saved.units ?? 'imperial',
          pairedDevices: saved.pairedDevices ?? [],
          voiceId: saved.voiceId ?? null,
        });
      }
    } catch {}
  },

  _persist: async () => {
    try {
      const {verbosity, units, pairedDevices, voiceId} = get();
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({verbosity, units, pairedDevices, voiceId}),
      );
    } catch {}
  },
}));

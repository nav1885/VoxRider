import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AlertVerbosity} from '../alerts/types';
import {DeviceInfo} from '../ble/types';
import {SidebarPosition, Units} from './types';

const STORAGE_KEY = '@voxrider_settings';

interface SettingsState {
  sidebarPosition: SidebarPosition;
  verbosity: AlertVerbosity;
  units: Units;
  pairedDevices: DeviceInfo[];

  setSidebarPosition: (pos: SidebarPosition) => void;
  setVerbosity: (v: AlertVerbosity) => void;
  setUnits: (u: Units) => void;
  addPairedDevice: (device: DeviceInfo) => void;
  removePairedDevice: (deviceId: string) => void;
  updateLastConnected: (deviceId: string) => void;
  loadFromStorage: () => Promise<void>;
  _persist: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  sidebarPosition: 'left',
  verbosity: AlertVerbosity.Detailed,
  units: 'imperial',
  pairedDevices: [],

  setSidebarPosition: pos => {
    set({sidebarPosition: pos});
    get()._persist();
  },
  setVerbosity: v => {
    set({verbosity: v});
    get()._persist();
  },
  setUnits: u => {
    set({units: u});
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
          sidebarPosition: saved.sidebarPosition ?? 'left',
          verbosity: saved.verbosity ?? AlertVerbosity.Detailed,
          units: saved.units ?? 'imperial',
          pairedDevices: saved.pairedDevices ?? [],
        });
      }
    } catch {}
  },

  _persist: async () => {
    try {
      const {sidebarPosition, verbosity, units, pairedDevices} = get();
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({sidebarPosition, verbosity, units, pairedDevices}),
      );
    } catch {}
  },
}));

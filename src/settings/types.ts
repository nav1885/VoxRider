import {AlertVerbosity} from '../alerts/types';
import {DeviceInfo} from '../ble/types';

export type SidebarPosition = 'left' | 'right';
export type Units = 'imperial' | 'metric';
export type TrafficMode = 'quiet' | 'busy' | 'very_busy';

export interface Settings {
  sidebarPosition: SidebarPosition;
  verbosity: AlertVerbosity;
  units: Units;
  pairedDevices: DeviceInfo[];
}

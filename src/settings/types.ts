import {AlertVerbosity} from '../alerts/types';
import {DeviceInfo} from '../ble/types';

export type SidebarPosition = 'left' | 'right';
export type Units = 'imperial' | 'metric';

export interface Settings {
  sidebarPosition: SidebarPosition;
  verbosity: AlertVerbosity;
  units: Units;
  pairedDevices: DeviceInfo[];
}

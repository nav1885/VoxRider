import {ThreatLevel} from '../ble/types';

export enum AlertVerbosity {
  Detailed = 'detailed',
  Balanced = 'balanced',
  Minimal = 'minimal',
}

export interface AlertSettings {
  verbosity: AlertVerbosity;
}

export interface AlertTrigger {
  count: number;
  maxLevel: ThreatLevel; // max level seen during debounce window — for message only
  isClear: boolean;
}

export interface LastSpokenState {
  count: number; // level never triggers alerts — count is the only thing that matters
}

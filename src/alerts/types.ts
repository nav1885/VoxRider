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
  maxLevel: ThreatLevel;
  isEscalation: boolean; // medium → high, bypasses throttle
  isClear: boolean;
}

export interface LastSpokenState {
  count: number;
  maxLevel: ThreatLevel;
}

import {ThreatLevel} from '../ble/types';
import {AlertTrigger, AlertVerbosity} from './types';
import {Strings} from '../constants/strings';

/**
 * Build the TTS message string for a given alert trigger and verbosity setting.
 * Distance is never spoken — audio warns, visual strip informs.
 */
export function buildAlertMessage(trigger: AlertTrigger, verbosity: AlertVerbosity): string {
  if (trigger.isClear) {
    return Strings.ttsClear;
  }

  const {count, maxLevel} = trigger;
  const speedDescriptor = maxLevel === ThreatLevel.High ? Strings.speedHigh : Strings.speedMedium;

  switch (verbosity) {
    case AlertVerbosity.Detailed:
      return count === 1
        ? Strings.ttsDetailedSingle(speedDescriptor)
        : Strings.ttsDetailedMultiple(count, speedDescriptor);

    case AlertVerbosity.Balanced:
      return count === 1 ? Strings.ttsBalancedSingle : Strings.ttsBalancedMultiple(count);

    case AlertVerbosity.Minimal:
      return count === 1 ? Strings.ttsMinimalSingle : Strings.ttsMinimalMultiple(count);
  }
}

import {buildAlertMessage} from '../alerts/buildAlertMessage';
import {AlertVerbosity} from '../alerts/types';
import {ThreatLevel} from '../ble/types';
import type {AlertTrigger} from '../alerts/types';

const trigger = (
  count: number,
  maxLevel: ThreatLevel,
  isClear = false,
  isEscalation = false,
): AlertTrigger => ({count, maxLevel, isClear, isEscalation});

describe('buildAlertMessage', () => {
  describe('clear', () => {
    it('returns "Clear" for all verbosity levels', () => {
      const t = trigger(0, ThreatLevel.None, true);
      expect(buildAlertMessage(t, AlertVerbosity.Detailed)).toBe('Clear');
      expect(buildAlertMessage(t, AlertVerbosity.Balanced)).toBe('Clear');
      expect(buildAlertMessage(t, AlertVerbosity.Minimal)).toBe('Clear');
    });
  });

  describe('Detailed verbosity', () => {
    it('single medium threat', () => {
      expect(buildAlertMessage(trigger(1, ThreatLevel.Medium), AlertVerbosity.Detailed)).toBe(
        '1 vehicle, medium speed',
      );
    });

    it('single high threat', () => {
      expect(buildAlertMessage(trigger(1, ThreatLevel.High), AlertVerbosity.Detailed)).toBe(
        '1 vehicle, high speed',
      );
    });

    it('multiple medium threats', () => {
      expect(buildAlertMessage(trigger(3, ThreatLevel.Medium), AlertVerbosity.Detailed)).toBe(
        '3 vehicles, medium speed',
      );
    });

    it('multiple with high max level', () => {
      expect(buildAlertMessage(trigger(2, ThreatLevel.High), AlertVerbosity.Detailed)).toBe(
        '2 vehicles, high speed',
      );
    });
  });

  describe('Balanced verbosity', () => {
    it('single vehicle', () => {
      expect(buildAlertMessage(trigger(1, ThreatLevel.High), AlertVerbosity.Balanced)).toBe(
        '1 vehicle',
      );
    });

    it('multiple vehicles', () => {
      expect(buildAlertMessage(trigger(4, ThreatLevel.Medium), AlertVerbosity.Balanced)).toBe(
        '4 vehicles',
      );
    });
  });

  describe('Minimal verbosity', () => {
    it('single car', () => {
      expect(buildAlertMessage(trigger(1, ThreatLevel.High), AlertVerbosity.Minimal)).toBe('car');
    });

    it('multiple cars', () => {
      expect(buildAlertMessage(trigger(2, ThreatLevel.Medium), AlertVerbosity.Minimal)).toBe(
        '2 cars',
      );
    });
  });
});

import {AlertEngine} from '../alerts/AlertEngine';
import {ThreatLevel, ConnectionStatus, Threat} from '../ble/types';
import {AlertTrigger} from '../alerts/types';

const connected = ConnectionStatus.Connected;
const searching = ConnectionStatus.Scanning;

const threat = (level: ThreatLevel, distance = 80, speed = 10): Threat => ({level, distance, speed});
const medium = (d = 80) => threat(ThreatLevel.Medium, d);
const high = (d = 40) => threat(ThreatLevel.High, d);

describe('AlertEngine', () => {
  let engine: AlertEngine;
  let fired: AlertTrigger[];

  beforeEach(() => {
    jest.useFakeTimers();
    fired = [];
    engine = new AlertEngine(t => fired.push(t));
  });

  afterEach(() => {
    jest.useRealTimers();
    engine.reset();
  });

  describe('connection gate', () => {
    it('does not fire when not connected', () => {
      engine.evaluate([medium()], searching);
      expect(fired).toHaveLength(0);
    });

    it('does not fire when reconnecting', () => {
      engine.evaluate([medium()], ConnectionStatus.Reconnecting);
      expect(fired).toHaveLength(0);
    });

    it('fires when connected', () => {
      engine.evaluate([medium()], connected);
      expect(fired).toHaveLength(1);
    });
  });

  describe('count increases', () => {
    it('fires on first threat (zero → one)', () => {
      engine.evaluate([medium()], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({count: 1, isClear: false, isEscalation: false});
    });

    it('fires on one → two threats', () => {
      engine.evaluate([medium()], connected);
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      fired = [];

      jest.advanceTimersByTime(2001);
      engine.evaluate([medium(80), medium(60)], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(2);
    });

    it('does not fire when count decreases (not to zero)', () => {
      engine.updateLastSpoken({count: 3, maxLevel: ThreatLevel.Medium});
      engine.evaluate([medium(), medium()], connected); // count 2 < last 3
      expect(fired).toHaveLength(0);
    });

    it('does not fire for same count', () => {
      engine.evaluate([medium()], connected);
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      fired = [];

      jest.advanceTimersByTime(2001);
      engine.evaluate([medium()], connected);
      expect(fired).toHaveLength(0);
    });
  });

  describe('escalation (medium → high)', () => {
    it('fires escalation trigger on medium → high', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([high()], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({isEscalation: true, maxLevel: ThreatLevel.High});
    });

    it('does not fire on high → medium de-escalation', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
      engine.evaluate([medium()], connected);
      expect(fired).toHaveLength(0);
    });

    it('escalation bypasses throttle', () => {
      engine.evaluate([medium()], connected);
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      fired = [];

      // No time advance — throttle still active
      engine.evaluate([high()], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0].isEscalation).toBe(true);
    });

    it('non-escalation respects 2s throttle', () => {
      engine.evaluate([medium()], connected);
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      fired = [];

      jest.advanceTimersByTime(1999);
      engine.evaluate([medium(80), medium(60)], connected);
      expect(fired).toHaveLength(0);

      jest.advanceTimersByTime(2);
      engine.evaluate([medium(80), medium(60)], connected);
      expect(fired).toHaveLength(1);
    });
  });

  describe('all clear', () => {
    it('fires clear after 3s debounce', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([], connected);
      expect(fired).toHaveLength(0);

      jest.advanceTimersByTime(3001);
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({isClear: true, count: 0});
    });

    it('resets clear debounce if threats reappear within 3s', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([], connected);
      jest.advanceTimersByTime(2000);

      engine.evaluate([medium()], connected); // threats back
      jest.advanceTimersByTime(3001);

      const clearFired = fired.filter(f => f.isClear);
      expect(clearFired).toHaveLength(0);
    });

    it('forces clear after 5s cap regardless', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([], connected);

      jest.advanceTimersByTime(5001);
      const clearFired = fired.filter(f => f.isClear);
      expect(clearFired).toHaveLength(1);
    });

    it('does not fire clear if last state was already clear', () => {
      // No lastSpokenState set (count: 0 default)
      engine.evaluate([], connected);
      jest.advanceTimersByTime(5001);
      expect(fired).toHaveLength(0);
    });
  });

  describe('snapshot-on-completion (evaluateAfterTTSFinished)', () => {
    it('fires if count increased since last spoken', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluateAfterTTSFinished([medium(), medium()], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(2);
    });

    it('does not fire if state unchanged since last spoken', () => {
      engine.updateLastSpoken({count: 2, maxLevel: ThreatLevel.Medium});
      engine.evaluateAfterTTSFinished([medium(), medium()], connected);
      expect(fired).toHaveLength(0);
    });

    it('does not fire if state de-escalated', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
      engine.evaluateAfterTTSFinished([medium()], connected);
      expect(fired).toHaveLength(0);
    });

    it('fires if level escalated since last spoken', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluateAfterTTSFinished([high()], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0].isEscalation).toBe(true);
    });
  });
});

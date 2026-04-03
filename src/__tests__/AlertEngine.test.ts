import {AlertEngine} from '../alerts/AlertEngine';
import {ThreatLevel, ConnectionStatus, Threat} from '../ble/types';
import {AlertTrigger} from '../alerts/types';

const connected = ConnectionStatus.Connected;
const scanning = ConnectionStatus.Scanning;

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

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Advance past the change debounce (1.5 s). */
  const flushDebounce = () => jest.advanceTimersByTime(1501);

  /** Advance past the change cap (4 s). */
  const flushCap = () => jest.advanceTimersByTime(4001);

  // ── Connection gate ────────────────────────────────────────────────────────

  describe('connection gate', () => {
    it('does not fire when not connected', () => {
      engine.evaluate([medium()], scanning);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });

    it('does not fire when reconnecting', () => {
      engine.evaluate([medium()], ConnectionStatus.Reconnecting);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });

    it('fires after debounce when connected', () => {
      engine.evaluate([medium()], connected);
      expect(fired).toHaveLength(0); // not yet
      flushDebounce();
      expect(fired).toHaveLength(1);
    });
  });

  // ── Count increases ────────────────────────────────────────────────────────

  describe('count increases', () => {
    it('fires on first threat (zero → one) after debounce', () => {
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({count: 1, isClear: false, isEscalation: false});
    });

    it('fires on one → two after debounce', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([medium(), medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(2);
    });

    it('batches rapid increases — announces final stable count once', () => {
      // 0 → 1 → 2 → 3 all within the debounce window
      engine.evaluate([medium()], connected);
      jest.advanceTimersByTime(300);
      engine.evaluate([medium(), medium()], connected);
      jest.advanceTimersByTime(300);
      engine.evaluate([medium(), medium(), medium()], connected);
      flushDebounce();

      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(3);
    });

    it('does not fire for same count', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });
  });

  // ── Count decreases (new behaviour — fixes #41) ────────────────────────────

  describe('count decreases (not to zero)', () => {
    it('announces updated count when count drops (3 → 1)', () => {
      engine.updateLastSpoken({count: 3, maxLevel: ThreatLevel.Medium});
      engine.evaluate([medium()], connected); // now 1
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({count: 1, isClear: false, isEscalation: false});
    });

    it('announces updated count when count drops by one (2 → 1)', () => {
      engine.updateLastSpoken({count: 2, maxLevel: ThreatLevel.Medium});
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(1);
    });

    it('batches rapid decreases — announces final stable count once', () => {
      engine.updateLastSpoken({count: 4, maxLevel: ThreatLevel.Medium});
      engine.evaluate([medium(), medium(), medium()], connected); // 4→3
      jest.advanceTimersByTime(300);
      engine.evaluate([medium(), medium()], connected); // 3→2
      jest.advanceTimersByTime(300);
      engine.evaluate([medium()], connected); // 2→1
      flushDebounce();

      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(1);
    });

    it('does not fire when count oscillates back to lastSpoken before debounce fires', () => {
      // lastSpoken=2, drop to 1, then back to 2 before debounce
      engine.updateLastSpoken({count: 2, maxLevel: ThreatLevel.Medium});
      engine.evaluate([medium()], connected); // 2→1
      jest.advanceTimersByTime(500);
      engine.evaluate([medium(), medium()], connected); // back to 2
      flushDebounce();

      expect(fired).toHaveLength(0);
    });
  });

  // ── Debounce cap ───────────────────────────────────────────────────────────

  describe('debounce cap (busy road)', () => {
    it('forces announcement within 4 s even when count keeps changing', () => {
      // Count changes every 500 ms — debounce keeps restarting
      engine.evaluate([medium()], connected);
      for (let i = 0; i < 7; i++) {
        jest.advanceTimersByTime(500);
        engine.evaluate([medium(), medium()], connected);
        jest.advanceTimersByTime(500);
        engine.evaluate([medium()], connected);
      }
      // Cap (4 s) should have fired by now
      expect(fired.length).toBeGreaterThanOrEqual(1);
    });

    it('cap fires once — a second cap does not start until after announce', () => {
      engine.evaluate([medium()], connected);
      jest.advanceTimersByTime(500);
      engine.evaluate([medium(), medium()], connected); // keep debounce alive

      // Cap fires at 4 s
      flushCap();
      const countAfterCap = fired.length;

      // After that, no stale timers fire again
      jest.advanceTimersByTime(4001);
      expect(fired.length).toBe(countAfterCap);
    });
  });

  // ── Escalation ────────────────────────────────────────────────────────────

  describe('escalation (medium → high)', () => {
    it('fires immediately — no debounce wait', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([high()], connected);
      // No time advance — should already be fired
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({isEscalation: true, maxLevel: ThreatLevel.High});
    });

    it('cancels any pending debounced change when escalation fires', () => {
      // First, queue a count-increase debounce
      engine.evaluate([medium(), medium()], connected); // pending: 2 cars
      jest.advanceTimersByTime(500);
      // Now escalation arrives
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([high()], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0].isEscalation).toBe(true);

      // The queued debounce should not fire
      flushDebounce();
      expect(fired).toHaveLength(1);
    });

    it('does not fire on high → medium de-escalation', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
      engine.evaluate([medium()], connected);
      flushDebounce();
      // De-escalation is a decrease — it fires as a normal debounced change,
      // NOT as an escalation
      expect(fired[0]?.isEscalation).toBeFalsy();
    });
  });

  // ── All clear ─────────────────────────────────────────────────────────────

  describe('all clear', () => {
    it('fires clear after 3 s debounce', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([], connected);
      expect(fired).toHaveLength(0);

      jest.advanceTimersByTime(3001);
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({isClear: true, count: 0});
    });

    it('resets clear debounce if threats reappear within 3 s', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([], connected);
      jest.advanceTimersByTime(2000);

      engine.evaluate([medium()], connected); // threats back
      jest.advanceTimersByTime(3001);

      const clearFired = fired.filter(f => f.isClear);
      expect(clearFired).toHaveLength(0);
    });

    it('forces clear after 5 s cap', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluate([], connected);

      jest.advanceTimersByTime(5001);
      const clearFired = fired.filter(f => f.isClear);
      expect(clearFired).toHaveLength(1);
    });

    it('does not fire clear if last state was already clear', () => {
      engine.evaluate([], connected); // lastSpoken default count=0
      jest.advanceTimersByTime(5001);
      expect(fired).toHaveLength(0);
    });

    it('cancels pending change debounce when threats clear', () => {
      engine.evaluate([medium()], connected); // pending debounce
      jest.advanceTimersByTime(500);
      engine.evaluate([], connected); // all clear
      flushDebounce(); // pending change should NOT fire

      const nonClear = fired.filter(f => !f.isClear);
      expect(nonClear).toHaveLength(0);
    });
  });

  // ── snapshot-on-completion (evaluateAfterTTSFinished) ─────────────────────

  describe('evaluateAfterTTSFinished', () => {
    it('schedules debounced update if count increased since last spoken', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluateAfterTTSFinished([medium(), medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(2);
    });

    it('schedules debounced update if count decreased since last spoken', () => {
      engine.updateLastSpoken({count: 3, maxLevel: ThreatLevel.Medium});
      engine.evaluateAfterTTSFinished([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(1);
    });

    it('does not fire if state unchanged', () => {
      engine.updateLastSpoken({count: 2, maxLevel: ThreatLevel.Medium});
      engine.evaluateAfterTTSFinished([medium(), medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });

    it('fires escalation immediately', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.evaluateAfterTTSFinished([high()], connected);
      expect(fired).toHaveLength(1);
      expect(fired[0].isEscalation).toBe(true);
    });

    // Bug #43 fix
    it('restarts clear debounce when clear was dropped while speaking', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      // TTS was speaking when threats cleared — evaluateAfterTTSFinished is called with count=0
      engine.evaluateAfterTTSFinished([], connected);
      expect(fired).toHaveLength(0); // not yet

      jest.advanceTimersByTime(3001);
      expect(fired).toHaveLength(1);
      expect(fired[0].isClear).toBe(true);
    });

    it('does not double-fire clear if debounce already running', () => {
      engine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      // Normal evaluate starts the clear debounce
      engine.evaluate([], connected);
      // Then TTS finishes and also calls evaluateAfterTTSFinished
      engine.evaluateAfterTTSFinished([], connected);

      jest.advanceTimersByTime(5001);
      const clearFired = fired.filter(f => f.isClear);
      expect(clearFired).toHaveLength(1); // only one clear
    });
  });
});

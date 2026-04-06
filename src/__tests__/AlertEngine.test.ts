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

  /** Advance past the change debounce (1.25 s). */
  const flushDebounce = () => jest.advanceTimersByTime(1251);

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
      expect(fired[0]).toMatchObject({count: 1, isClear: false});
    });

    it('fires on one → two after debounce', () => {
      engine.updateLastSpoken({count: 1});
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
      engine.updateLastSpoken({count: 1});
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });

    it('does not fire when level changes but count stays the same', () => {
      // Speed/level never triggers audio — count is the only driver
      engine.updateLastSpoken({count: 1});
      engine.evaluate([high()], connected); // same count=1, different level
      flushDebounce();
      expect(fired).toHaveLength(0);
    });
  });

  // ── Count decreases ────────────────────────────────────────────────────────

  describe('count decreases (not to zero)', () => {
    it('announces updated count when count drops (3 → 1)', () => {
      engine.updateLastSpoken({count: 3});
      engine.evaluate([medium()], connected); // now 1
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({count: 1, isClear: false});
    });

    it('announces updated count when count drops by one (2 → 1)', () => {
      engine.updateLastSpoken({count: 2});
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(1);
    });

    it('batches rapid decreases — announces final stable count once', () => {
      engine.updateLastSpoken({count: 4});
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
      engine.updateLastSpoken({count: 2});
      engine.evaluate([medium()], connected); // 2→1
      jest.advanceTimersByTime(500);
      engine.evaluate([medium(), medium()], connected); // back to 2
      flushDebounce();

      expect(fired).toHaveLength(0);
    });
  });

  // ── Max level in message ───────────────────────────────────────────────────

  describe('max level during debounce window', () => {
    it('reports max level seen during window, not just latest', () => {
      engine.evaluate([high()], connected);           // high in window
      jest.advanceTimersByTime(500);
      engine.evaluate([medium()], connected);         // drops to medium
      // count still 1 vs lastSpoken 0 — debounce fires with count=1
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].maxLevel).toBe(ThreatLevel.High); // max of window, not latest
    });
  });

  // ── Debounce cap ───────────────────────────────────────────────────────────

  describe('debounce cap (busy road)', () => {
    it('forces announcement within 4 s even when count keeps changing', () => {
      engine.evaluate([medium()], connected);
      for (let i = 0; i < 7; i++) {
        jest.advanceTimersByTime(500);
        engine.evaluate([medium(), medium()], connected);
        jest.advanceTimersByTime(500);
        engine.evaluate([medium()], connected);
      }
      expect(fired.length).toBeGreaterThanOrEqual(1);
    });

    it('cap fires once — a second cap does not start until after announce', () => {
      engine.evaluate([medium()], connected);
      jest.advanceTimersByTime(500);
      engine.evaluate([medium(), medium()], connected);

      flushCap();
      const countAfterCap = fired.length;

      jest.advanceTimersByTime(4001);
      expect(fired.length).toBe(countAfterCap);
    });
  });

  // ── All clear ─────────────────────────────────────────────────────────────

  describe('all clear', () => {
    it('fires clear after 3 s debounce', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluate([], connected);
      expect(fired).toHaveLength(0);

      jest.advanceTimersByTime(3001);
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({isClear: true, count: 0});
    });

    it('resets clear debounce if threats reappear within 3 s', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluate([], connected);
      jest.advanceTimersByTime(2000);

      engine.evaluate([medium()], connected);
      jest.advanceTimersByTime(3001);

      const clearFired = fired.filter(f => f.isClear);
      expect(clearFired).toHaveLength(0);
    });

    it('forces clear after 5 s cap', () => {
      engine.updateLastSpoken({count: 1});
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
      engine.updateLastSpoken({count: 1});
      engine.evaluateAfterTTSFinished([medium(), medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(2);
    });

    it('schedules debounced update if count decreased since last spoken', () => {
      engine.updateLastSpoken({count: 3});
      engine.evaluateAfterTTSFinished([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].count).toBe(1);
    });

    it('does not fire if count unchanged', () => {
      engine.updateLastSpoken({count: 2});
      engine.evaluateAfterTTSFinished([medium(), medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });

    it('does not fire when only level changed but count is same', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluateAfterTTSFinished([high()], connected); // count still 1
      flushDebounce();
      expect(fired).toHaveLength(0);
    });

    it('restarts clear debounce when clear was dropped while speaking', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluateAfterTTSFinished([], connected);
      expect(fired).toHaveLength(0);

      jest.advanceTimersByTime(3001);
      expect(fired).toHaveLength(1);
      expect(fired[0].isClear).toBe(true);
    });

    it('does not double-fire clear if debounce already running', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluate([], connected);
      engine.evaluateAfterTTSFinished([], connected);

      jest.advanceTimersByTime(5001);
      const clearFired = fired.filter(f => f.isClear);
      expect(clearFired).toHaveLength(1);
    });
  });
});

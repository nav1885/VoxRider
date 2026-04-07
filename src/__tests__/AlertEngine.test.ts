import {AlertEngine} from '../alerts/AlertEngine';
import {ThreatLevel, ConnectionStatus, Threat} from '../ble/types';
import {AlertTrigger} from '../alerts/types';

const connected = ConnectionStatus.Connected;
const scanning = ConnectionStatus.Scanning;

const threat = (level: ThreatLevel, distance = 80, speed = 10): Threat => ({level, distance, speed});
const medium = (d = 80) => threat(ThreatLevel.Medium, d);
const high = (d = 40) => threat(ThreatLevel.High, d);

// Keep in sync with AlertEngine constants
const CHANGE_DEBOUNCE_MS = 750;
const CHANGE_CAP_MS = 3000;
const CLEAR_DEBOUNCE_MS = 1500;
const CLEAR_DEBOUNCE_CAP_MS = 3000;

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

  const flushDebounce = () => jest.advanceTimersByTime(CHANGE_DEBOUNCE_MS + 1);
  const flushCap = () => jest.advanceTimersByTime(CHANGE_CAP_MS + 1);
  const flushClear = () => jest.advanceTimersByTime(CLEAR_DEBOUNCE_MS + 1);
  const flushClearCap = () => jest.advanceTimersByTime(CLEAR_DEBOUNCE_CAP_MS + 1);

  // Simulate TTSEngine speaking the trigger (updates lastSpoken)
  const speak = (trigger: AlertTrigger) => {
    engine.updateLastSpoken({count: trigger.isClear ? 0 : trigger.count});
  };

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
      expect(fired).toHaveLength(0);
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
      engine.evaluate([medium()], connected);
      jest.advanceTimersByTime(200);
      engine.evaluate([medium(), medium()], connected);
      jest.advanceTimersByTime(200);
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
      engine.updateLastSpoken({count: 1});
      engine.evaluate([high()], connected);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });
  });

  // ── Count decreases (non-zero) ─────────────────────────────────────────────

  describe('count decreases (not to zero)', () => {
    it('announces updated count when count drops (3 → 1)', () => {
      engine.updateLastSpoken({count: 3});
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({count: 1, isClear: false});
    });

    it('does not fire when count oscillates back to lastSpoken before debounce fires', () => {
      engine.updateLastSpoken({count: 2});
      engine.evaluate([medium()], connected);
      jest.advanceTimersByTime(300);
      engine.evaluate([medium(), medium()], connected);
      flushDebounce();

      expect(fired).toHaveLength(0);
    });
  });

  // ── Max level in message ───────────────────────────────────────────────────

  describe('max level during debounce window', () => {
    it('reports max level seen during window, not just latest', () => {
      engine.evaluate([high()], connected);
      jest.advanceTimersByTime(300);
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0].maxLevel).toBe(ThreatLevel.High);
    });
  });

  // ── Debounce cap ───────────────────────────────────────────────────────────

  describe('debounce cap (busy road)', () => {
    it('forces announcement within cap even when count keeps changing', () => {
      engine.evaluate([medium()], connected);
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(400);
        engine.evaluate([medium(), medium()], connected);
        jest.advanceTimersByTime(400);
        engine.evaluate([medium()], connected);
      }
      expect(fired.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── All clear ─────────────────────────────────────────────────────────────

  describe('all clear', () => {
    it('fires clear after debounce', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluate([], connected);
      expect(fired).toHaveLength(0);
      flushClear();
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({isClear: true, count: 0});
    });

    it('forces clear after cap', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluate([], connected);
      flushClearCap();
      expect(fired.filter(f => f.isClear)).toHaveLength(1);
    });

    it('does not fire clear if last state was already clear', () => {
      engine.evaluate([], connected);
      flushClearCap();
      expect(fired).toHaveLength(0);
    });

    it('cancels pending change debounce when threats clear', () => {
      engine.evaluate([medium()], connected);
      jest.advanceTimersByTime(300);
      engine.evaluate([], connected);
      flushDebounce();

      expect(fired.filter(f => !f.isClear)).toHaveLength(0);
    });

    it('cancels clear debounce when new threat arrives', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluate([], connected);
      jest.advanceTimersByTime(CLEAR_DEBOUNCE_MS - 100);

      engine.evaluate([medium()], connected);
      flushClearCap();

      expect(fired.filter(f => f.isClear)).toHaveLength(0);
    });
  });

  // ── Regression: new car after clear ───────────────────────────────────────
  //
  // These tests cover the specific failure modes observed on 2026-04-06:
  //   1. Car announced → clears → new car arrives but is never announced
  //   2. After clear is announced, subsequent cars are never announced

  describe('regression: new car after clear', () => {
    it('announces new car that arrives while clear debounce is running', () => {
      // Car announced, lastSpoken=1
      engine.updateLastSpoken({count: 1});

      // Car clears — clear debounce starts
      engine.evaluate([], connected);
      jest.advanceTimersByTime(CLEAR_DEBOUNCE_MS - 100); // debounce still running

      // New car arrives before clear fires
      engine.evaluate([medium()], connected);
      flushDebounce();

      // New car must be announced (even though count=1 matches old lastSpoken,
      // the clear debounce reset lastSpoken to 0 when it was cancelled)
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({count: 1, isClear: false});
    });

    it('announces new car that arrives after clear is announced', () => {
      // Car announced
      engine.updateLastSpoken({count: 1});

      // Car clears → clear fires → lastSpoken updated to 0
      engine.evaluate([], connected);
      flushClear();
      expect(fired).toHaveLength(1);
      expect(fired[0].isClear).toBe(true);
      speak(fired[0]); // simulate TTSEngine updating lastSpoken

      // New car arrives
      engine.evaluate([medium()], connected);
      flushDebounce();

      expect(fired).toHaveLength(2);
      expect(fired[1]).toMatchObject({count: 1, isClear: false});
    });

    it('evaluateAfterTTSFinished starts clear debounce when road is empty', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluateAfterTTSFinished([], connected);
      expect(fired).toHaveLength(0);

      flushClear();
      expect(fired).toHaveLength(1);
      expect(fired[0].isClear).toBe(true);
    });

    it('evaluateAfterTTSFinished does not double-fire clear if debounce already running', () => {
      engine.updateLastSpoken({count: 1});
      engine.evaluate([], connected);             // starts clear debounce
      engine.evaluateAfterTTSFinished([], connected); // should not start a second one

      flushClearCap();
      expect(fired.filter(f => f.isClear)).toHaveLength(1);
    });

    it('full sequence: car → clear → new car — all three announced', () => {
      // 1. First car arrives
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({count: 1, isClear: false});
      speak(fired[0]);

      // 2. Car passes — clear debounce fires
      engine.evaluate([], connected);
      flushClear();
      expect(fired).toHaveLength(2);
      expect(fired[1].isClear).toBe(true);
      speak(fired[1]); // lastSpoken now 0

      // 3. New car arrives
      engine.evaluate([medium()], connected);
      flushDebounce();
      expect(fired).toHaveLength(3);
      expect(fired[2]).toMatchObject({count: 1, isClear: false});
    });
  });

  // ── evaluateAfterTTSFinished ───────────────────────────────────────────────

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
      engine.evaluateAfterTTSFinished([high()], connected);
      flushDebounce();
      expect(fired).toHaveLength(0);
    });
  });
});

import {TTSEngine, ITTSBackend} from '../alerts/TTSEngine';
import {AlertEngine} from '../alerts/AlertEngine';
import {AlertVerbosity} from '../alerts/types';
import {ThreatLevel, ConnectionStatus, Threat} from '../ble/types';

const connected = ConnectionStatus.Connected;

const medium = (): Threat => ({speed: 10, distance: 80, level: ThreatLevel.Medium});
const high = (): Threat => ({speed: 25, distance: 40, level: ThreatLevel.High});

function makeBackend(): ITTSBackend & {lastUtterance: string; stopCalled: boolean; triggerFinished: () => void} {
  let _onFinished: (() => void) | null = null;
  return {
    lastUtterance: '',
    stopCalled: false,
    speak(utterance, onFinished) {
      this.lastUtterance = utterance;
      _onFinished = onFinished;
    },
    stop() {
      this.stopCalled = true;
      _onFinished = null;
    },
    triggerFinished() {
      if (_onFinished) {
        _onFinished();
        _onFinished = null;
      }
    },
  };
}

describe('TTSEngine', () => {
  let engine: TTSEngine;
  let alertEngine: AlertEngine;
  let backend: ReturnType<typeof makeBackend>;

  beforeEach(() => {
    jest.useFakeTimers();
    backend = makeBackend();
    alertEngine = new AlertEngine(() => {});
    engine = new TTSEngine(backend, alertEngine, AlertVerbosity.Detailed);
    engine.updateState([], connected);
  });

  afterEach(() => {
    jest.useRealTimers();
    alertEngine.reset();
  });

  describe('basic speech', () => {
    it('speaks alert message via backend', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});
      expect(backend.lastUtterance).toBe('1 vehicle, medium speed');
    });

    it('speaks clear message', () => {
      engine.handleTrigger({count: 0, maxLevel: ThreatLevel.None, isClear: true});
      expect(backend.lastUtterance).toBe('Clear');
    });
  });

  describe('TTS always finishes in full — no interruptions', () => {
    it('drops second trigger while speaking', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});
      const firstUtterance = backend.lastUtterance;

      engine.handleTrigger({count: 2, maxLevel: ThreatLevel.Medium, isClear: false});
      expect(backend.lastUtterance).toBe(firstUtterance); // unchanged
      expect(backend.stopCalled).toBe(false);
    });

    it('never calls stop on the backend for any trigger', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});
      engine.handleTrigger({count: 2, maxLevel: ThreatLevel.High, isClear: false});
      engine.handleTrigger({count: 3, maxLevel: ThreatLevel.High, isClear: false});
      expect(backend.stopCalled).toBe(false);
    });
  });

  describe('snapshot-on-completion', () => {
    it('re-evaluates state after TTS finishes — fires after debounce if count changed', () => {
      alertEngine.updateLastSpoken({count: 1});
      engine.updateState([medium(), medium()], connected); // 2 now
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});

      const utteranceBefore = backend.lastUtterance;
      backend.triggerFinished();
      expect(backend.lastUtterance).toBe(utteranceBefore); // not yet

      jest.advanceTimersByTime(1251); // debounce fires
      expect(backend.lastUtterance).toBe('2 vehicles, medium speed');
    });

    it('does not re-fire if count unchanged after finish', () => {
      alertEngine.updateLastSpoken({count: 1});
      engine.updateState([medium()], connected);
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});

      const utteranceBefore = backend.lastUtterance;
      backend.triggerFinished();
      jest.advanceTimersByTime(1251);
      expect(backend.lastUtterance).toBe(utteranceBefore);
    });

    it('does not re-fire if only level changed but count is same after finish', () => {
      alertEngine.updateLastSpoken({count: 1});
      engine.updateState([high()], connected); // count still 1
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});

      const utteranceBefore = backend.lastUtterance;
      backend.triggerFinished();
      jest.advanceTimersByTime(1251);
      expect(backend.lastUtterance).toBe(utteranceBefore);
    });
  });

  describe('10s watchdog timer', () => {
    it('force-resets speaking state if onFinished never fires', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});

      jest.advanceTimersByTime(10001);

      // Should now accept new triggers (no longer "speaking")
      engine.handleTrigger({count: 2, maxLevel: ThreatLevel.Medium, isClear: false});
      expect(backend.lastUtterance).toBe('2 vehicles, medium speed');
    });

    it('cancels watchdog when onFinished fires normally', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});
      backend.triggerFinished();
      expect(() => jest.advanceTimersByTime(10001)).not.toThrow();
    });
  });

  describe('audio focus loss', () => {
    it('resets speaking state on audio focus loss', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isClear: false});
      engine.onAudioFocusLoss();

      engine.handleTrigger({count: 2, maxLevel: ThreatLevel.Medium, isClear: false});
      expect(backend.lastUtterance).toBe('2 vehicles, medium speed');
    });
  });
});

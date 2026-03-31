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
  let alertsFired: ReturnType<typeof makeBackend>['lastUtterance'][];

  beforeEach(() => {
    jest.useFakeTimers();
    backend = makeBackend();
    alertsFired = [];
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
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      expect(backend.lastUtterance).toBe('1 vehicle, medium speed');
    });

    it('speaks clear message', () => {
      engine.handleTrigger({count: 0, maxLevel: ThreatLevel.None, isEscalation: false, isClear: true});
      expect(backend.lastUtterance).toBe('Clear');
    });
  });

  describe('non-escalation dropped while speaking', () => {
    it('drops second non-escalation trigger while speaking', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      const firstUtterance = backend.lastUtterance;

      engine.handleTrigger({count: 2, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      expect(backend.lastUtterance).toBe(firstUtterance); // unchanged
    });
  });

  describe('escalation interrupt', () => {
    it('interrupts current speech on escalation', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      expect(backend.lastUtterance).toBe('1 vehicle, medium speed');

      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.High, isEscalation: true, isClear: false});
      expect(backend.stopCalled).toBe(true);
      expect(backend.lastUtterance).toBe('1 vehicle, high speed');
    });
  });

  describe('snapshot-on-completion', () => {
    it('re-evaluates state after TTS finishes — fires if worse', () => {
      // Speak about 1 medium vehicle
      alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.updateState([medium(), medium()], connected); // 2 now
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});

      // Finish TTS — engine should detect 2 vehicles now > 1 spoken
      const utteranceBefore = backend.lastUtterance;
      backend.triggerFinished();
      expect(backend.lastUtterance).not.toBe(utteranceBefore);
      expect(backend.lastUtterance).toBe('2 vehicles, medium speed');
    });

    it('does not re-fire if state unchanged after finish', () => {
      alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
      engine.updateState([medium()], connected);
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});

      const utteranceBefore = backend.lastUtterance;
      backend.triggerFinished();
      expect(backend.lastUtterance).toBe(utteranceBefore);
    });

    it('does not re-fire if state de-escalated after finish', () => {
      alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
      engine.updateState([medium()], connected);
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.High, isEscalation: true, isClear: false});

      const utteranceBefore = backend.lastUtterance;
      backend.triggerFinished();
      expect(backend.lastUtterance).toBe(utteranceBefore);
    });
  });

  describe('10s watchdog timer', () => {
    it('force-resets speaking state if onFinished never fires', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      // Never call triggerFinished — simulate stuck TTS

      // Advance past watchdog
      jest.advanceTimersByTime(10001);

      // Should now accept new non-escalation triggers (no longer "speaking")
      engine.handleTrigger({count: 2, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      expect(backend.lastUtterance).toBe('2 vehicles, medium speed');
    });

    it('cancels watchdog when onFinished fires normally', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      backend.triggerFinished();

      // Watchdog should be cleared — advancing time should not cause issues
      expect(() => jest.advanceTimersByTime(10001)).not.toThrow();
    });
  });

  describe('audio focus loss', () => {
    it('resets speaking state on audio focus loss', () => {
      engine.handleTrigger({count: 1, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});

      engine.onAudioFocusLoss();

      // Should accept new triggers now
      engine.handleTrigger({count: 2, maxLevel: ThreatLevel.Medium, isEscalation: false, isClear: false});
      expect(backend.lastUtterance).toBe('2 vehicles, medium speed');
    });
  });
});

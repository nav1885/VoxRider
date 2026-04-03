/**
 * End-to-end pipeline integration test.
 * Simulates a full ride scenario: BLE packets flow through parser → AlertEngine → TTSEngine.
 * Uses MockBLEManager and a mock TTS backend — no native modules required.
 */
import {MockBLEManager} from '../ble/MockBLEManager';
import {AlertEngine} from '../alerts/AlertEngine';
import {TTSEngine, ITTSBackend} from '../alerts/TTSEngine';
import {AlertVerbosity} from '../alerts/types';
import {ThreatLevel, ConnectionStatus, Threat} from '../ble/types';

function makeMockBackend(): ITTSBackend & {spoken: string[]; stopCount: number} {
  return {
    spoken: [],
    stopCount: 0,
    speak(utterance, onFinished) {
      this.spoken.push(utterance);
      // Auto-finish after a tick so snapshot logic runs
      setTimeout(onFinished, 0);
    },
    stop() {
      this.stopCount++;
    },
  };
}

describe('Full pipeline integration', () => {
  let ble: MockBLEManager;
  let alertEngine: AlertEngine;
  let ttsBackend: ReturnType<typeof makeMockBackend>;
  let ttsEngine: TTSEngine;
  let currentThreats: Threat[];

  beforeEach(() => {
    jest.useFakeTimers();
    ble = new MockBLEManager();
    ttsBackend = makeMockBackend();
    alertEngine = new AlertEngine(() => {});
    ttsEngine = new TTSEngine(ttsBackend, alertEngine, AlertVerbosity.Detailed);
    currentThreats = [];

    // Wire BLE → parser → stores → AlertEngine
    ble.subscribe((threats, _battery) => {
      currentThreats = threats;
      alertEngine.evaluate(threats, ConnectionStatus.Connected);
      ttsEngine.updateState(threats, ConnectionStatus.Connected);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    alertEngine.reset();
  });

  it('full ride: vehicle appears, escalates, clears', () => {
    // 1. Medium speed vehicle appears — debounce fires after 1.5s
    ble.emitThreats([{speed: 12, distance: 120, level: ThreatLevel.Medium}]);
    expect(ttsBackend.spoken).toHaveLength(0); // not yet

    jest.advanceTimersByTime(1501); // debounce fires
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
    expect(ttsBackend.spoken).toHaveLength(1);
    expect(ttsBackend.spoken[0]).toBe('1 vehicle, medium speed');

    // 2. Same vehicle escalates to high speed — fires immediately (no debounce)
    ble.emitThreats([{speed: 22, distance: 80, level: ThreatLevel.High}]);
    expect(ttsBackend.spoken).toHaveLength(2);
    expect(ttsBackend.spoken[1]).toBe('1 vehicle, high speed');

    // 3. Second vehicle appears — debounce fires after 1.5s
    jest.advanceTimersByTime(1); // tick for TTS auto-finish
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
    ble.emitThreats([
      {speed: 22, distance: 40, level: ThreatLevel.High},
      {speed: 15, distance: 100, level: ThreatLevel.Medium},
    ]);
    jest.advanceTimersByTime(1501);
    alertEngine.updateLastSpoken({count: 2, maxLevel: ThreatLevel.High});
    expect(ttsBackend.spoken[ttsBackend.spoken.length - 1]).toBe('2 vehicles, high speed');

    // 4. All clear — debounced 3s
    ble.emitThreats([]);
    expect(ttsBackend.spoken.filter(s => s === 'Clear')).toHaveLength(0); // not yet

    jest.advanceTimersByTime(3001);
    expect(ttsBackend.spoken.filter(s => s === 'Clear')).toHaveLength(1);
  });

  it('no alerts fired when BLE disconnected', () => {
    const isolatedBle = new MockBLEManager();
    const isolatedBackend = makeMockBackend();
    const isolatedAlertEngine = new AlertEngine(() => {});
    const isolatedTTS = new TTSEngine(isolatedBackend, isolatedAlertEngine, AlertVerbosity.Detailed);

    isolatedBle.subscribe((threats) => {
      isolatedAlertEngine.evaluate(threats, ConnectionStatus.Disconnected);
      isolatedTTS.updateState(threats, ConnectionStatus.Disconnected);
    });

    isolatedBle.emitThreats([{speed: 20, distance: 50, level: ThreatLevel.High}]);
    jest.advanceTimersByTime(1501);
    expect(isolatedBackend.spoken).toHaveLength(0);
  });

  it('no alert on escalation de-escalation — fires as a count-stable level change', () => {
    // lastSpoken = high; packet is now medium — this is a level change (decrease),
    // so it fires as a debounced update (not an escalation interrupt)
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
    ble.emitThreats([{speed: 10, distance: 80, level: ThreatLevel.Medium}]);
    expect(ttsBackend.spoken).toHaveLength(0); // no immediate fire

    jest.advanceTimersByTime(1501); // debounce fires
    expect(ttsBackend.spoken).toHaveLength(1);
    expect(ttsBackend.spoken[0]).toBe('1 vehicle, medium speed');
  });

  it('announces updated count when count decreases but not to zero (#41 fix)', () => {
    // Previously: count decrease was silently ignored. Now it announces.
    alertEngine.updateLastSpoken({count: 3, maxLevel: ThreatLevel.Medium});
    ble.emitThreats([
      {speed: 12, distance: 60, level: ThreatLevel.Medium},
      {speed: 10, distance: 90, level: ThreatLevel.Medium},
    ]);
    expect(ttsBackend.spoken).toHaveLength(0); // not yet

    jest.advanceTimersByTime(1501); // debounce fires
    expect(ttsBackend.spoken).toHaveLength(1);
    expect(ttsBackend.spoken[0]).toBe('2 vehicles, medium speed');
  });

  it('snapshot fires after TTS finishes if more vehicles arrived mid-speech', () => {
    // 1st packet: 1 vehicle — schedule debounce
    ble.emitThreats([{speed: 12, distance: 80, level: ThreatLevel.Medium}]);
    jest.advanceTimersByTime(1501); // debounce fires → speaking
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});
    expect(ttsBackend.spoken).toHaveLength(1);

    // 2nd packet: 2 vehicles appear while TTS is speaking
    ble.emitThreats([
      {speed: 12, distance: 80, level: ThreatLevel.Medium},
      {speed: 15, distance: 60, level: ThreatLevel.Medium},
    ]);
    // 2nd trigger is dropped while speaking — snapshot-on-completion handles it
    expect(ttsBackend.spoken).toHaveLength(1);

    // TTS auto-finishes (setTimeout 0) + debounce for snapshot
    jest.advanceTimersByTime(1); // tick for onFinished callback
    jest.advanceTimersByTime(1501); // debounce from evaluateAfterTTSFinished
    expect(ttsBackend.spoken).toHaveLength(2);
    expect(ttsBackend.spoken[1]).toBe('2 vehicles, medium speed');
  });
});

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

  it('full ride: vehicle appears, second vehicle appears, all clear', () => {
    // 1. First vehicle appears — debounce 2s
    ble.emitThreats([{speed: 12, distance: 120, level: ThreatLevel.Medium}]);
    expect(ttsBackend.spoken).toHaveLength(0);

    jest.advanceTimersByTime(1251);
    alertEngine.updateLastSpoken({count: 1});
    expect(ttsBackend.spoken).toHaveLength(1);
    expect(ttsBackend.spoken[0]).toBe('1 vehicle, medium speed');

    // 2. Second vehicle appears — debounce 2s
    jest.advanceTimersByTime(1); // tick for TTS auto-finish
    ble.emitThreats([
      {speed: 12, distance: 80, level: ThreatLevel.Medium},
      {speed: 22, distance: 120, level: ThreatLevel.High},
    ]);
    jest.advanceTimersByTime(1251);
    alertEngine.updateLastSpoken({count: 2});
    expect(ttsBackend.spoken[ttsBackend.spoken.length - 1]).toBe('2 vehicles, high speed');

    // 3. All clear — debounced 3s
    ble.emitThreats([]);
    expect(ttsBackend.spoken.filter(s => s === 'Clear')).toHaveLength(0);

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
    jest.advanceTimersByTime(1251);
    expect(isolatedBackend.spoken).toHaveLength(0);
  });

  it('level change alone does not trigger announcement', () => {
    // count=1 already spoken, same car speeds up — no audio trigger
    alertEngine.updateLastSpoken({count: 1});
    ble.emitThreats([{speed: 25, distance: 60, level: ThreatLevel.High}]);
    jest.advanceTimersByTime(1251);
    expect(ttsBackend.spoken).toHaveLength(0);
  });

  it('announces updated count when count decreases but not to zero', () => {
    alertEngine.updateLastSpoken({count: 3});
    ble.emitThreats([
      {speed: 12, distance: 60, level: ThreatLevel.Medium},
      {speed: 10, distance: 90, level: ThreatLevel.Medium},
    ]);
    expect(ttsBackend.spoken).toHaveLength(0);

    jest.advanceTimersByTime(1251);
    expect(ttsBackend.spoken).toHaveLength(1);
    expect(ttsBackend.spoken[0]).toBe('2 vehicles, medium speed');
  });

  it('snapshot fires after TTS finishes if more vehicles arrived mid-speech', () => {
    ble.emitThreats([{speed: 12, distance: 80, level: ThreatLevel.Medium}]);
    jest.advanceTimersByTime(1251); // debounce fires → speaking
    alertEngine.updateLastSpoken({count: 1});
    expect(ttsBackend.spoken).toHaveLength(1);

    // 2nd vehicle arrives while TTS is speaking — dropped, snapshot handles it
    ble.emitThreats([
      {speed: 12, distance: 80, level: ThreatLevel.Medium},
      {speed: 15, distance: 60, level: ThreatLevel.Medium},
    ]);
    expect(ttsBackend.spoken).toHaveLength(1);

    jest.advanceTimersByTime(1);    // tick for onFinished callback
    jest.advanceTimersByTime(1251); // debounce from evaluateAfterTTSFinished
    expect(ttsBackend.spoken).toHaveLength(2);
    expect(ttsBackend.spoken[1]).toBe('2 vehicles, medium speed');
  });

  it('TTS is never interrupted — always finishes in full', () => {
    ble.emitThreats([{speed: 12, distance: 120, level: ThreatLevel.Medium}]);
    jest.advanceTimersByTime(1251);

    // Rapid changes while speaking — none should call stop()
    ble.emitThreats([{speed: 25, distance: 80, level: ThreatLevel.High}]);
    ble.emitThreats([{speed: 25, distance: 60, level: ThreatLevel.High}]);
    expect(ttsBackend.stopCount).toBe(0);
  });
});

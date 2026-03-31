/**
 * End-to-end pipeline integration test.
 * Simulates a full ride scenario: BLE packets flow through parser → AlertEngine → TTSEngine.
 * Uses MockBLEManager and a mock TTS backend — no native modules required.
 */
import {MockBLEManager} from '../ble/MockBLEManager';
import {parseRadarPacket} from '../ble/parseRadarPacket';
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

  it('full ride: vehicle appears, escalates, clears', async () => {
    // 1. Medium speed vehicle at 120m
    ble.emitThreats([{speed: 12, distance: 120, level: ThreatLevel.Medium}]);
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});

    expect(ttsBackend.spoken).toHaveLength(1);
    expect(ttsBackend.spoken[0]).toBe('1 vehicle, medium speed');

    // 2. Same vehicle escalates to high speed — interrupt
    ble.emitThreats([{speed: 22, distance: 80, level: ThreatLevel.High}]);
    expect(ttsBackend.spoken).toHaveLength(2);
    expect(ttsBackend.spoken[1]).toBe('1 vehicle, high speed');
    expect(ttsBackend.stopCount).toBe(1); // interrupted previous speech

    // 3. Second vehicle appears
    jest.advanceTimersByTime(100); // let TTS auto-finish
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
    jest.advanceTimersByTime(2001); // past throttle
    ble.emitThreats([
      {speed: 22, distance: 40, level: ThreatLevel.High},
      {speed: 15, distance: 100, level: ThreatLevel.Medium},
    ]);
    expect(ttsBackend.spoken[ttsBackend.spoken.length - 1]).toBe('2 vehicles, high speed');

    // 4. All clear — debounced 3s
    alertEngine.updateLastSpoken({count: 2, maxLevel: ThreatLevel.High});
    ble.emitThreats([]);
    expect(ttsBackend.spoken.filter(s => s === 'Clear')).toHaveLength(0); // not yet

    jest.advanceTimersByTime(3001);
    expect(ttsBackend.spoken.filter(s => s === 'Clear')).toHaveLength(1);
  });

  it('no alerts fired when BLE disconnected', () => {
    // Fresh isolated setup — not connected
    const isolatedBle = new MockBLEManager();
    const isolatedBackend = makeMockBackend();
    const isolatedAlertEngine = new AlertEngine(() => {});
    const isolatedTTS = new TTSEngine(isolatedBackend, isolatedAlertEngine, AlertVerbosity.Detailed);

    isolatedBle.subscribe((threats) => {
      isolatedAlertEngine.evaluate(threats, ConnectionStatus.Disconnected);
      isolatedTTS.updateState(threats, ConnectionStatus.Disconnected);
    });

    isolatedBle.emitThreats([{speed: 20, distance: 50, level: ThreatLevel.High}]);
    expect(isolatedBackend.spoken).toHaveLength(0);
  });

  it('no alert on de-escalation', () => {
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.High});
    ble.emitThreats([{speed: 10, distance: 80, level: ThreatLevel.Medium}]);
    expect(ttsBackend.spoken).toHaveLength(0);
  });

  it('no alert when count decreases but not to zero', () => {
    alertEngine.updateLastSpoken({count: 3, maxLevel: ThreatLevel.Medium});
    ble.emitThreats([
      {speed: 12, distance: 60, level: ThreatLevel.Medium},
      {speed: 10, distance: 90, level: ThreatLevel.Medium},
    ]);
    expect(ttsBackend.spoken).toHaveLength(0);
  });

  it('snapshot fires after TTS finishes if more vehicles arrived mid-speech', () => {
    // Start speaking about 1 vehicle
    ble.emitThreats([{speed: 12, distance: 80, level: ThreatLevel.Medium}]);
    expect(ttsBackend.spoken).toHaveLength(1);

    // Before TTS finishes, a second vehicle appears
    ble.emitThreats([
      {speed: 12, distance: 80, level: ThreatLevel.Medium},
      {speed: 15, distance: 60, level: ThreatLevel.Medium},
    ]);
    // Still only 1 spoken (second trigger dropped while speaking)
    expect(ttsBackend.spoken).toHaveLength(1);

    // TTS finishes — snapshot should detect 2 vehicles > 1 spoken
    jest.advanceTimersByTime(1); // tick for setTimeout(onFinished, 0)
    alertEngine.updateLastSpoken({count: 1, maxLevel: ThreatLevel.Medium});

    // The second speak fires from snapshot
    jest.advanceTimersByTime(1);
    expect(ttsBackend.spoken).toHaveLength(2);
    expect(ttsBackend.spoken[1]).toBe('2 vehicles, medium speed');
  });
});

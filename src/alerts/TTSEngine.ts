import {AlertEngine} from './AlertEngine';
import {buildAlertMessage} from './buildAlertMessage';
import {AlertTrigger, AlertVerbosity} from './types';
import {Threat, ConnectionStatus, ThreatLevel} from '../ble/types';
import {useDebugStore} from '../debug/debugStore';

const WATCHDOG_MS = 6000;

export interface ITTSBackend {
  speak(utterance: string, onFinished: () => void): void;
  stop(): void;
}

/**
 * TTSEngine — wraps TTS backend with:
 * - Snapshot-on-completion: no queue, re-evaluate on finish
 * - Escalation interrupt: medium→high bypasses everything
 * - 10s watchdog: force-resets if onFinished never fires
 * - Audio focus loss handling (Android): call onAudioFocusLoss() from native event
 */
export class TTSEngine {
  private speaking = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private currentThreats: Threat[] = [];
  private currentConnectionStatus: ConnectionStatus = ConnectionStatus.Disconnected;
  private verbosity: AlertVerbosity;
  private backend: ITTSBackend;
  private alertEngine: AlertEngine;
  private onSpeak: ((message: string) => void) | null;

  constructor(
    backend: ITTSBackend,
    alertEngine: AlertEngine,
    verbosity: AlertVerbosity,
    onSpeak?: (message: string) => void,
  ) {
    this.backend = backend;
    this.alertEngine = alertEngine;
    this.verbosity = verbosity;
    this.onSpeak = onSpeak ?? null;
    // Close the loop: AlertEngine fires triggers → TTSEngine speaks them
    alertEngine.setOnTrigger((trigger) => this.handleTrigger(trigger));
  }

  setVerbosity(verbosity: AlertVerbosity): void {
    this.verbosity = verbosity;
  }

  /** Called by BLE layer with latest threats on every packet */
  updateState(threats: Threat[], connectionStatus: ConnectionStatus): void {
    this.currentThreats = threats;
    this.currentConnectionStatus = connectionStatus;
  }

  /** Fire an alert. Always dropped if TTS is speaking — snapshot-on-completion re-evaluates. */
  handleTrigger(trigger: AlertTrigger): void {
    const label = trigger.isClear ? 'clear' : `count=${trigger.count}`;
    if (this.speaking) {
      this._log(`DROP (busy): ${label}`);
      return;
    }
    const message = buildAlertMessage(trigger, this.verbosity);
    this._log(`SPOKE: "${message}"`);
    this._speak(message, trigger);
  }

  /**
   * Speak a message directly, bypassing the AlertEngine trigger system.
   * Used for test alerts. Interrupts any current speech.
   */
  speakImmediate(message: string): void {
    if (this.speaking) {
      this.backend.stop();
      this._clearWatchdog();
      this.speaking = false;
    }
    this.speaking = true;
    this._startWatchdog();
    this.backend.speak(message, () => {
      this._onFinished();
    });
  }

  /** Called when Android audio focus is lost — treat as implicit speech end */
  onAudioFocusLoss(): void {
    if (this.speaking) {
      this._log('audio focus lost → forcing finish');
      this._onFinished();
    }
  }

  private _speak(message: string, trigger: AlertTrigger): void {
    this.speaking = true;
    this.alertEngine.updateLastSpoken({count: trigger.isClear ? 0 : trigger.count});

    this._startWatchdog();
    this.onSpeak?.(message);

    this.backend.speak(message, () => {
      this._onFinished();
    });
  }

  private _onFinished(): void {
    if (!this.speaking) {
      this._log('onFinished: already reset, ignored');
      return; // Already reset (watchdog or focus loss fired first)
    }
    this._clearWatchdog();
    this.speaking = false;
    this._log('done → evaluating');

    // Snapshot-on-completion: re-evaluate current state
    this.alertEngine.evaluateAfterTTSFinished(
      this.currentThreats,
      this.currentConnectionStatus,
    );
  }

  private _startWatchdog(): void {
    this._clearWatchdog();
    this.watchdog = setTimeout(() => {
      // onFinished never fired — force reset speaking state only.
      // Don't call evaluateAfterTTSFinished here: that could immediately start
      // another utterance on the same broken backend. The normal 1Hz evaluate()
      // loop will re-announce on the next BLE packet.
      this._log('WATCHDOG fired — speaking reset');
      this.speaking = false;
      this.watchdog = null;
    }, WATCHDOG_MS);
  }

  private _clearWatchdog(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }

  private _log(line: string): void {
    useDebugStore.getState().appendTTSLog(line);
  }
}

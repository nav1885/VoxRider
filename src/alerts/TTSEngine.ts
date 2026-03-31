import {AlertEngine} from './AlertEngine';
import {buildAlertMessage} from './buildAlertMessage';
import {AlertTrigger, AlertVerbosity} from './types';
import {Threat, ConnectionStatus, ThreatLevel} from '../ble/types';

const WATCHDOG_MS = 10000;

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

  constructor(backend: ITTSBackend, alertEngine: AlertEngine, verbosity: AlertVerbosity) {
    this.backend = backend;
    this.alertEngine = alertEngine;
    this.verbosity = verbosity;
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

  /** Fire an alert. Escalations interrupt; others are dropped if already speaking. */
  handleTrigger(trigger: AlertTrigger): void {
    if (this.speaking && !trigger.isEscalation) {
      // Non-escalation: discard — snapshot-on-completion will re-evaluate
      return;
    }

    if (trigger.isEscalation && this.speaking) {
      // Interrupt current speech
      this.backend.stop();
      this._clearWatchdog();
      this.speaking = false;
    }

    const message = buildAlertMessage(trigger, this.verbosity);
    this._speak(message, trigger);
  }

  /** Called when Android audio focus is lost — treat as implicit speech end */
  onAudioFocusLoss(): void {
    if (this.speaking) {
      this._onFinished();
    }
  }

  private _speak(message: string, trigger: AlertTrigger): void {
    this.speaking = true;
    this.alertEngine.updateLastSpoken({
      count: trigger.count,
      maxLevel: trigger.isClear ? ThreatLevel.None : trigger.maxLevel,
    });

    this._startWatchdog();

    this.backend.speak(message, () => {
      this._onFinished();
    });
  }

  private _onFinished(): void {
    if (!this.speaking) {
      return; // Already reset (watchdog or focus loss fired first)
    }
    this._clearWatchdog();
    this.speaking = false;

    // Snapshot-on-completion: re-evaluate current state
    this.alertEngine.evaluateAfterTTSFinished(
      this.currentThreats,
      this.currentConnectionStatus,
    );
  }

  private _startWatchdog(): void {
    this._clearWatchdog();
    this.watchdog = setTimeout(() => {
      // onFinished never fired — force reset
      this.speaking = false;
      this.watchdog = null;
      this.alertEngine.evaluateAfterTTSFinished(
        this.currentThreats,
        this.currentConnectionStatus,
      );
    }, WATCHDOG_MS);
  }

  private _clearWatchdog(): void {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }
}

import {Threat, ThreatLevel, ConnectionStatus} from '../ble/types';
import {getMaxThreatLevel} from '../ble/parseRadarPacket';
import {AlertTrigger, LastSpokenState} from './types';

const THROTTLE_MS = 2000;
const CLEAR_DEBOUNCE_MS = 3000;
const CLEAR_DEBOUNCE_CAP_MS = 5000;

export class AlertEngine {
  private lastSpokenState: LastSpokenState = {count: 0, maxLevel: ThreatLevel.None};
  private lastAlertTime = 0;
  private clearDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private clearCapTimer: ReturnType<typeof setTimeout> | null = null;
  private onTrigger: (trigger: AlertTrigger) => void;

  constructor(onTrigger: (trigger: AlertTrigger) => void) {
    this.onTrigger = onTrigger;
  }

  setOnTrigger(cb: (trigger: AlertTrigger) => void): void {
    this.onTrigger = cb;
  }

  /**
   * Evaluate incoming threat state against last spoken state.
   * Only fires if connected and something materially changed.
   */
  evaluate(threats: Threat[], connectionStatus: ConnectionStatus): void {
    if (connectionStatus !== ConnectionStatus.Connected) {
      return;
    }

    const count = threats.length;
    const maxLevel = getMaxThreatLevel(threats);
    const now = Date.now();

    // --- All clear ---
    if (count === 0) {
      if (this.lastSpokenState.count > 0) {
        this._startClearDebounce();
      }
      return;
    }

    // Threats present — cancel any pending clear
    this._cancelClearDebounce();

    // --- Escalation: medium → high (bypasses throttle, interrupts) ---
    const isEscalation =
      maxLevel === ThreatLevel.High && this.lastSpokenState.maxLevel < ThreatLevel.High;

    if (isEscalation) {
      this._fire({count, maxLevel, isEscalation: true, isClear: false});
      return;
    }

    // --- Count increase ---
    const countIncreased = count > this.lastSpokenState.count;
    if (!countIncreased) {
      return;
    }

    // Throttle non-escalation alerts
    if (now - this.lastAlertTime < THROTTLE_MS) {
      return;
    }

    this._fire({count, maxLevel, isEscalation: false, isClear: false});
  }

  /**
   * Called after snapshot-on-completion — re-evaluate current state against
   * last spoken state. Only fires if state got worse since last alert.
   */
  evaluateAfterTTSFinished(threats: Threat[], connectionStatus: ConnectionStatus): void {
    if (connectionStatus !== ConnectionStatus.Connected) {
      return;
    }

    const count = threats.length;
    const maxLevel = getMaxThreatLevel(threats);

    if (count === 0) {
      // Let normal clear debounce handle it
      return;
    }

    const countIncreased = count > this.lastSpokenState.count;
    const levelEscalated = maxLevel > this.lastSpokenState.maxLevel;

    if (!countIncreased && !levelEscalated) {
      return;
    }

    const isEscalation = maxLevel === ThreatLevel.High && this.lastSpokenState.maxLevel < ThreatLevel.High;
    this._fire({count, maxLevel, isEscalation, isClear: false});
  }

  /** Update last spoken state — called by TTSEngine when alert is spoken */
  updateLastSpoken(state: LastSpokenState): void {
    this.lastSpokenState = state;
    this.lastAlertTime = Date.now();
  }

  /** Reset state — called on disconnect or all-clear confirmed */
  reset(): void {
    this._cancelClearDebounce();
    this.lastSpokenState = {count: 0, maxLevel: ThreatLevel.None};
    this.lastAlertTime = 0;
  }

  private _fire(trigger: AlertTrigger): void {
    this.onTrigger(trigger);
  }

  private _startClearDebounce(): void {
    if (this.clearDebounceTimer !== null) {
      return; // Already pending
    }

    this.clearDebounceTimer = setTimeout(() => {
      this._cancelClearDebounce();
      this._fireClear();
    }, CLEAR_DEBOUNCE_MS);

    // Cap: force clear after 5s regardless — cancels debounce to avoid double-fire
    this.clearCapTimer = setTimeout(() => {
      this._cancelClearDebounce();
      this._fireClear();
    }, CLEAR_DEBOUNCE_CAP_MS);
  }

  private _cancelClearDebounce(): void {
    if (this.clearDebounceTimer !== null) {
      clearTimeout(this.clearDebounceTimer);
      this.clearDebounceTimer = null;
    }
    if (this.clearCapTimer !== null) {
      clearTimeout(this.clearCapTimer);
      this.clearCapTimer = null;
    }
  }

  private _fireClear(): void {
    this._fire({count: 0, maxLevel: ThreatLevel.None, isEscalation: false, isClear: true});
    this.lastSpokenState = {count: 0, maxLevel: ThreatLevel.None};
    this.lastAlertTime = Date.now();
  }
}

import {Threat, ThreatLevel, ConnectionStatus} from '../ble/types';
import {getMaxThreatLevel} from '../ble/parseRadarPacket';
import {AlertTrigger, LastSpokenState} from './types';

/**
 * How long to wait after a count/level change before announcing, so rapid
 * arrivals/departures are batched into a single stable summary.
 */
const CHANGE_DEBOUNCE_MS = 1500;

/**
 * Hard cap: even if changes keep arriving, never wait longer than this before
 * announcing. Prevents silence on continuously busy roads.
 */
const CHANGE_CAP_MS = 4000;

const CLEAR_DEBOUNCE_MS = 3000;
const CLEAR_DEBOUNCE_CAP_MS = 5000;

export class AlertEngine {
  private lastSpokenState: LastSpokenState = {count: 0, maxLevel: ThreatLevel.None};

  // Pending debounced change
  private pendingCount: number | null = null;
  private pendingMaxLevel: ThreatLevel = ThreatLevel.None;
  private changeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private changeCapTimer: ReturnType<typeof setTimeout> | null = null;

  // Clear debounce
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
   * Evaluate incoming threat state on every BLE packet.
   *
   * Fires when:
   *   - count OR maxLevel changed from lastSpoken (up or down), debounced
   *   - escalation medium→high: immediate, no debounce
   *   - threats cleared: 3 s debounce
   */
  evaluate(threats: Threat[], connectionStatus: ConnectionStatus): void {
    if (connectionStatus !== ConnectionStatus.Connected) {
      return;
    }

    const count = threats.length;
    const maxLevel = getMaxThreatLevel(threats);

    // ── All clear ──────────────────────────────────────────────────────────────
    if (count === 0) {
      this._cancelPendingChange();
      if (this.lastSpokenState.count > 0) {
        this._startClearDebounce();
      }
      return;
    }

    this._cancelClearDebounce();

    // ── Escalation: always immediate ───────────────────────────────────────────
    const isEscalation =
      maxLevel === ThreatLevel.High && this.lastSpokenState.maxLevel < ThreatLevel.High;
    if (isEscalation) {
      this._cancelPendingChange();
      this._fire({count, maxLevel, isEscalation: true, isClear: false});
      return;
    }

    // ── No change from lastSpoken ──────────────────────────────────────────────
    if (count === this.lastSpokenState.count && maxLevel === this.lastSpokenState.maxLevel) {
      this._cancelPendingChange();
      return;
    }

    // ── Change (increase or decrease) — debounce ───────────────────────────────
    this._schedulePendingChange(count, maxLevel);
  }

  /**
   * Called after snapshot-on-completion — re-evaluate current state.
   * Also handles the case where a clear was dropped while TTS was speaking (#43).
   */
  evaluateAfterTTSFinished(threats: Threat[], connectionStatus: ConnectionStatus): void {
    if (connectionStatus !== ConnectionStatus.Connected) {
      return;
    }

    const count = threats.length;
    const maxLevel = getMaxThreatLevel(threats);

    if (count === 0) {
      // Clear may have been dropped while we were speaking — restart debounce
      if (this.lastSpokenState.count > 0) {
        this._startClearDebounce();
      }
      return;
    }

    const isEscalation =
      maxLevel === ThreatLevel.High && this.lastSpokenState.maxLevel < ThreatLevel.High;
    if (isEscalation) {
      this._cancelPendingChange();
      this._fire({count, maxLevel, isEscalation: true, isClear: false});
      return;
    }

    if (count !== this.lastSpokenState.count || maxLevel !== this.lastSpokenState.maxLevel) {
      this._schedulePendingChange(count, maxLevel);
    }
  }

  /** Called by TTSEngine when an alert is spoken */
  updateLastSpoken(state: LastSpokenState): void {
    this.lastSpokenState = state;
  }

  /** Reset — call on disconnect */
  reset(): void {
    this._cancelClearDebounce();
    this._cancelPendingChange();
    this.lastSpokenState = {count: 0, maxLevel: ThreatLevel.None};
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _schedulePendingChange(count: number, maxLevel: ThreatLevel): void {
    this.pendingCount = count;
    this.pendingMaxLevel = maxLevel;

    // Restart debounce on every new change
    if (this.changeDebounceTimer !== null) {
      clearTimeout(this.changeDebounceTimer);
    }
    this.changeDebounceTimer = setTimeout(() => this._firePending(), CHANGE_DEBOUNCE_MS);

    // Cap: start only once — don't reset it, so busy roads always get an update
    if (this.changeCapTimer === null) {
      this.changeCapTimer = setTimeout(() => this._firePending(), CHANGE_CAP_MS);
    }
  }

  private _firePending(): void {
    if (this.changeDebounceTimer !== null) {
      clearTimeout(this.changeDebounceTimer);
      this.changeDebounceTimer = null;
    }
    if (this.changeCapTimer !== null) {
      clearTimeout(this.changeCapTimer);
      this.changeCapTimer = null;
    }

    if (this.pendingCount === null) {
      return;
    }

    const count = this.pendingCount;
    const maxLevel = this.pendingMaxLevel;
    this.pendingCount = null;

    // If the state has already returned to lastSpoken by the time debounce fires,
    // skip — nothing meaningful changed
    if (count === this.lastSpokenState.count && maxLevel === this.lastSpokenState.maxLevel) {
      return;
    }

    this._fire({count, maxLevel, isEscalation: false, isClear: false});
  }

  private _cancelPendingChange(): void {
    if (this.changeDebounceTimer !== null) {
      clearTimeout(this.changeDebounceTimer);
      this.changeDebounceTimer = null;
    }
    if (this.changeCapTimer !== null) {
      clearTimeout(this.changeCapTimer);
      this.changeCapTimer = null;
    }
    this.pendingCount = null;
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
    // Do NOT set lastSpokenState here. TTSEngine.updateLastSpoken() is authoritative —
    // it writes lastSpokenState only after the utterance is actually spoken.
    // If TTS is busy and drops this trigger, lastSpokenState.count remains > 0,
    // so evaluateAfterTTSFinished() correctly restarts the clear debounce.
  }
}

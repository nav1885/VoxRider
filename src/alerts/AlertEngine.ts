import {Threat, ThreatLevel} from '../ble/types';
import {getMaxThreatLevel} from '../ble/parseRadarPacket';
import {AlertTrigger, LastSpokenState} from './types';

const LEVEL_LABEL: Record<ThreatLevel, string> = {
  [ThreatLevel.None]:    'none',
  [ThreatLevel.Medium]:  'med',
  [ThreatLevel.High]:    'high',
  [ThreatLevel.Unknown]: 'unk',
};

/**
 * How long to wait after a count change before announcing.
 * At 1Hz from the Varia, 2s = 2 stable consecutive packets required.
 * Absorbs single-packet noise (phantom count flickers) without delaying
 * real car arrivals — a car at 140m takes ~5s to reach 100m at 100km/h.
 */
const CHANGE_DEBOUNCE_MS = 750;

/**
 * Hard cap: even if count keeps changing, never wait longer than this.
 * Prevents silence on a genuinely busy road.
 */
const CHANGE_CAP_MS = 3000;

const CLEAR_DEBOUNCE_MS = 1500;
const CLEAR_DEBOUNCE_CAP_MS = 3000;

export class AlertEngine {
  private lastSpokenState: LastSpokenState = {count: 0};

  // Pending debounced change
  private pendingCount: number | null = null;
  private pendingMaxLevel: ThreatLevel = ThreatLevel.None;
  private changeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private changeCapTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timestamp when the current pending count was first seen — background timer fallback. */
  private pendingFirstSeen: number | null = null;

  // Clear debounce
  private clearDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private clearCapTimer: ReturnType<typeof setTimeout> | null = null;
  /** Timestamp when the clear debounce first started — background timer fallback. */
  private clearFirstSeen: number | null = null;

  private onTrigger: (trigger: AlertTrigger) => void;
  private logFn: ((line: string) => void) | null;

  constructor(
    onTrigger: (trigger: AlertTrigger) => void,
    logFn?: (line: string) => void,
  ) {
    this.onTrigger = onTrigger;
    this.logFn = logFn ?? null;
  }

  setOnTrigger(cb: (trigger: AlertTrigger) => void): void {
    this.onTrigger = cb;
  }

  private _log(line: string): void {
    this.logFn?.(line);
  }

  /**
   * Evaluate incoming threat state on every BLE packet.
   *
   * Fires when count changes (up or down) — debounced 2s, capped at 4s.
   * Level/speed is never a trigger — it is carried in the message only,
   * as the max level seen during the debounce window.
   * TTS never interrupts — snapshot-on-completion handles mid-speech changes.
   */
  evaluate(threats: Threat[], connectionStatus: string): void {
    if (connectionStatus !== 'connected') {
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

    this._cancelClearDebounce(true);

    // ── No count change from lastSpoken ────────────────────────────────────────
    if (count === this.lastSpokenState.count) {
      this._cancelPendingChange();
      this._log(`same(${count}), skip`);
      return;
    }

    // ── Count changed — debounce ───────────────────────────────────────────────
    this._log(`${this.lastSpokenState.count}→${count} ${LEVEL_LABEL[maxLevel]}, debounce`);
    this._schedulePendingChange(count, maxLevel);
  }

  /**
   * Called after TTS finishes speaking — re-evaluate current state.
   * Handles clears that were dropped while TTS was speaking.
   */
  evaluateAfterTTSFinished(threats: Threat[], connectionStatus: string): void {
    if (connectionStatus !== 'connected') {
      return;
    }

    const count = threats.length;
    const maxLevel = getMaxThreatLevel(threats);

    if (count === 0) {
      if (this.lastSpokenState.count > 0) {
        this._log('post-TTS: count=0, restart clear debounce');
        this._startClearDebounce();
      }
      return;
    }

    if (count !== this.lastSpokenState.count) {
      this._log(`post-TTS: ${this.lastSpokenState.count}→${count} ${LEVEL_LABEL[maxLevel]}, debounce`);
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
    this.lastSpokenState = {count: 0};
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _schedulePendingChange(count: number, maxLevel: ThreatLevel): void {
    this.pendingCount = count;
    // Take the worst-case level seen during the debounce window.
    // If a car oscillates medium/high/medium, we report high — conservative and stable.
    this.pendingMaxLevel = Math.max(this.pendingMaxLevel, maxLevel) as ThreatLevel;

    // Track when this pending state began — used for background timer fallback below.
    if (this.pendingFirstSeen === null) {
      this.pendingFirstSeen = Date.now();
    }

    // Restart debounce on every new change (foreground path — timers work normally)
    if (this.changeDebounceTimer !== null) {
      clearTimeout(this.changeDebounceTimer);
    }
    this.changeDebounceTimer = setTimeout(() => this._firePending(), CHANGE_DEBOUNCE_MS);

    // Cap: start only once — forces announcement on continuously busy roads
    if (this.changeCapTimer === null) {
      this.changeCapTimer = setTimeout(() => this._firePending(), CHANGE_CAP_MS);
    }

    // Background fallback: if JS timers are throttled (ReactChoreographer paused), fire
    // when enough wall-clock time has elapsed since we first saw this count change.
    // BLE callbacks still run synchronously — every incoming packet acts as a timer check.
    if (Date.now() - this.pendingFirstSeen >= CHANGE_DEBOUNCE_MS) {
      this._firePending();
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
    this.pendingFirstSeen = null;

    if (this.pendingCount === null) {
      return;
    }

    const count = this.pendingCount;
    const maxLevel = this.pendingMaxLevel;
    this.pendingCount = null;
    this.pendingMaxLevel = ThreatLevel.None;

    // Count stabilised back to lastSpoken during debounce — nothing changed
    if (count === this.lastSpokenState.count) {
      this._log(`debounce resolved: count=${count} same as lastSpoken, skip`);
      return;
    }

    this._log(`FIRE count=${count} ${LEVEL_LABEL[maxLevel]}`);
    this._fire({count, maxLevel, isClear: false});
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
    this.pendingMaxLevel = ThreatLevel.None;
    this.pendingFirstSeen = null;
  }

  private _fire(trigger: AlertTrigger): void {
    console.log(`[AlertEngine] _fire isClear=${trigger.isClear} count=${trigger.count}`);
    this.onTrigger(trigger);
  }

  private _startClearDebounce(): void {
    // Track when the clear debounce first started for background timer fallback.
    if (this.clearFirstSeen === null) {
      this.clearFirstSeen = Date.now();
    }

    // Background fallback: fire immediately if debounce window already elapsed.
    if (Date.now() - this.clearFirstSeen >= CLEAR_DEBOUNCE_MS) {
      this._cancelClearDebounce();
      this._fireClear();
      return;
    }

    if (this.clearDebounceTimer !== null) {
      return; // Already pending — timer is running in foreground
    }
    this._log('clear debounce started');
    this.clearDebounceTimer = setTimeout(() => {
      this._cancelClearDebounce();
      this._fireClear();
    }, CLEAR_DEBOUNCE_MS);
    this.clearCapTimer = setTimeout(() => {
      this._cancelClearDebounce();
      this._fireClear();
    }, CLEAR_DEBOUNCE_CAP_MS);
  }

  private _cancelClearDebounce(resetIfPending = false): void {
    const hadPending = this.clearDebounceTimer !== null;
    if (this.clearDebounceTimer !== null) {
      clearTimeout(this.clearDebounceTimer);
      this.clearDebounceTimer = null;
    }
    if (this.clearCapTimer !== null) {
      clearTimeout(this.clearCapTimer);
      this.clearCapTimer = null;
    }
    this.clearFirstSeen = null;
    if (resetIfPending && hadPending) {
      // Road was confirmed empty (clear debounce was running) — reset lastSpoken
      // so the incoming threat is treated as fresh regardless of count.
      this.lastSpokenState = {count: 0};
    }
  }

  private _fireClear(): void {
    this._log('FIRE clear');
    this._fire({count: 0, maxLevel: ThreatLevel.None, isClear: true});
  }
}

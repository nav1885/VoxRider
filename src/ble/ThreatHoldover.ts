import {Threat} from './types';
import {getMaxThreatLevel} from './parseRadarPacket';

/**
 * ThreatHoldover — replaces VehicleTracker.
 *
 * Problem with distance-based matching (VehicleTracker):
 *   A fast-approaching car moves >30m during a BLE dropout. The old tracked
 *   position and the new observed position both exist simultaneously in the
 *   tracker → phantom "2 cars" from 1 physical car.
 *
 * Correct mental model:
 *   The Varia reports HOW MANY cars are present, not WHICH car is which.
 *   A count of 1 across consecutive packets IS the same car — no matching needed.
 *   The only problem to solve is BLE dropouts producing transient count=0 packets.
 *
 * Solution:
 *   - 0→N count increases are immediate (safety first — new car on a clear road).
 *   - N→M count increases (N > 0) are held for INCREASE_HOLD_MS before committing.
 *     The real RTL515 can report one physical car across two BLE threat slots
 *     briefly as it approaches. Holding for ~1.5 s (1–2 Varia packets at 1 Hz)
 *     absorbs these phantom multi-slot artifacts without delaying real arrivals
 *     (a car at 140 m still gives >3 s of warning at 100 km/h).
 *   - Count decreases are held for HOLDOVER_MS before propagating to the store.
 *   - If count recovers during the hold window → cancel hold, update immediately.
 *   - Level escalations at the same count are always immediate.
 */

const HOLDOVER_MS = 2000; // covers typical BLE dropout bursts (~1–3 s)

/**
 * If the closest stable vehicle was within this distance when count drops,
 * the car has almost certainly passed the rider — evict immediately.
 *
 * Derived from max vehicle speed (28 m/s) × BLE tick (1s) = 28m, rounded up.
 * At ≤30m a dropout is unlikely (strong signal, rider proximity) and lingering
 * a passed car on screen for 2s is worse than a false eviction.
 */
const PASS_THRESHOLD_M = 30;

/**
 * How long to hold a count *increase* from N→M (N > 0) before committing.
 * Suppresses phantom multi-slot count spikes from the real Varia RTL515.
 * Must be 0→N for the timer to NOT apply (new car is always immediate).
 */
const INCREASE_HOLD_MS = 1500;

export class ThreatHoldover {
  private stable: Threat[] = [];

  // Decrease holdover
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingThreats: Threat[] = [];

  // Increase holdover (N→M where N > 0)
  private increaseHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingIncreaseThreats: Threat[] = [];

  private onUpdate: (threats: Threat[]) => void;

  constructor(onUpdate: (threats: Threat[]) => void) {
    this.onUpdate = onUpdate;
  }

  feed(raw: Threat[]): void {
    const stableCount = this.stable.length;
    const newCount = raw.length;
    const stableMax = getMaxThreatLevel(this.stable);
    const newMax = getMaxThreatLevel(raw);

    const isIncrease = newCount > stableCount;
    const isEscalation = newCount > 0 && newMax > stableMax;

    // ── Count decreased ──────────────────────────────────────────────────────
    if (newCount < stableCount) {
      // Count fell back — any in-flight increase was phantom; cancel it.
      this._cancelIncreaseHold();

      // Guard: stableCount > 0 here by invariant, but be explicit to avoid
      // Math.min(...[]) returning Infinity on an unexpected empty stable array.
      const closestStable =
        this.stable.length > 0
          ? Math.min(...this.stable.map(t => t.distance))
          : Infinity;

      if (closestStable <= PASS_THRESHOLD_M) {
        // Car almost certainly passed the rider — evict immediately.
        this._cancelHold();
        this._commit(raw);
        return;
      }

      // Count dropped mid-road — start hold to absorb BLE dropouts.
      this.pendingThreats = raw;
      if (this.holdTimer === null) {
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          this._commit(this.pendingThreats);
        }, HOLDOVER_MS);
      }
      return;
    }

    // ── Count increased ──────────────────────────────────────────────────────
    if (isIncrease) {
      this._cancelHold();

      if (stableCount === 0) {
        // 0→N: new car from a clear road — always immediate (safety-critical).
        this._cancelIncreaseHold();
        this._commit(raw);
        return;
      }

      // N→M (N > 0): hold before committing.
      // Track the highest count seen during the hold window.
      if (raw.length >= this.pendingIncreaseThreats.length) {
        this.pendingIncreaseThreats = raw;
      }
      if (this.increaseHoldTimer === null) {
        this.increaseHoldTimer = setTimeout(() => {
          this.increaseHoldTimer = null;
          const pending = this.pendingIncreaseThreats;
          this.pendingIncreaseThreats = [];
          this._commit(pending);
        }, INCREASE_HOLD_MS);
      }
      return;
    }

    // ── Level escalation at the same count ──────────────────────────────────
    if (isEscalation) {
      this._cancelHold();
      this._cancelIncreaseHold();
      this._commit(raw);
      return;
    }

    // ── Same count, same or lower level ─────────────────────────────────────
    // Count returned to stable level — cancel any in-flight increase hold.
    this._cancelIncreaseHold();
    // Count recovered from a decrease hold — cancel and commit.
    this._cancelHold();
    this._commit(raw);
  }

  reset(): void {
    this._cancelHold();
    this._cancelIncreaseHold();
    this.stable = [];
    this.onUpdate([]);
  }

  private _commit(threats: Threat[]): void {
    this.stable = threats;
    this.onUpdate(threats);
  }

  private _cancelHold(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private _cancelIncreaseHold(): void {
    if (this.increaseHoldTimer !== null) {
      clearTimeout(this.increaseHoldTimer);
      this.increaseHoldTimer = null;
    }
    this.pendingIncreaseThreats = [];
  }
}

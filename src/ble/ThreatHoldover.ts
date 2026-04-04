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
 *   - Count increases and level escalations propagate IMMEDIATELY (safety first).
 *   - Count decreases are held for HOLDOVER_MS before propagating to the store.
 *   - If count recovers during the hold window → cancel hold, update immediately.
 *   - This absorbs BLE dropouts without any distance-based matching.
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

export class ThreatHoldover {
  private stable: Threat[] = [];
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingThreats: Threat[] = [];
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

    if (isIncrease || isEscalation) {
      // More threats or escalation — always immediate
      this._cancelHold();
      this._commit(raw);
      return;
    }

    if (newCount < stableCount) {
      // If the closest stable vehicle was within pass threshold, it physically
      // passed the rider — evict immediately rather than holding.
      // Guard: stableCount > 0 here by invariant, but be explicit to avoid
      // Math.min(...[]) returning Infinity on an unexpected empty stable array.
      const closestStable =
        this.stable.length > 0
          ? Math.min(...this.stable.map(t => t.distance))
          : Infinity;
      if (closestStable <= PASS_THRESHOLD_M) {
        this._cancelHold();
        this._commit(raw);
        return;
      }

      // Count dropped mid-road — start hold to absorb BLE dropouts
      this.pendingThreats = raw;
      if (this.holdTimer === null) {
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          this._commit(this.pendingThreats);
        }, HOLDOVER_MS);
      }
      return;
    }

    // Same count (newCount === stableCount), same or lower level.
    // If a hold is running, count has recovered — cancel hold and commit.
    // If no hold, just propagate the updated position/speed.
    this._cancelHold();
    this._commit(raw);
  }

  reset(): void {
    this._cancelHold();
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
}

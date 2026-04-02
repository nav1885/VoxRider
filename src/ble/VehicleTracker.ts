import {Threat, ThreatLevel} from './types';

/**
 * VehicleTracker — persistent vehicle tracking layer between raw BLE packets
 * and the radar store.
 *
 * Problem it solves:
 *   The Varia BLE protocol sends a fresh threat list every ~1 second with no
 *   persistent vehicle IDs. Brief BLE noise can cause a car to drop out for
 *   1–2 packets then reappear — which the naive approach treats as a "new" car
 *   and re-announces. On a busy road this produces a flood of repeated alerts
 *   for the same vehicle.
 *
 * How it works:
 *   Each incoming packet is reconciled against the current tracked vehicle set
 *   by distance proximity. A tracked vehicle's distance is updated when a match
 *   is found. If no packet threat matches a tracked vehicle for EVICTION_PACKETS
 *   consecutive packets (~3 s), the vehicle is considered to have passed and is
 *   evicted. New threats that don't match any existing vehicle are immediately
 *   added as new tracked vehicles — triggering a count increase and therefore
 *   a new TTS alert.
 *
 * Matching window:
 *   MATCH_DISTANCE_M = 30 m. This covers an approaching car at up to 108 km/h
 *   per 1 s packet interval while avoiding spurious merges of two distinct cars
 *   that happen to be at similar distances.
 */

const MATCH_DISTANCE_M = 30;   // metres — max distance delta to consider same vehicle
const EVICTION_PACKETS = 3;    // consecutive missed packets before vehicle is evicted (~3 s)

interface TrackedVehicle {
  id: string;
  distance: number;    // metres, updated each packet
  speed: number;       // m/s
  level: ThreatLevel;
  missedPackets: number;
}

export class VehicleTracker {
  private vehicles = new Map<string, TrackedVehicle>();
  private nextId = 1;

  /**
   * Feed a raw threat list from one BLE packet.
   * Returns the current stable set of tracked threats (may differ in count from input).
   */
  update(rawThreats: Threat[]): Threat[] {
    const matched = new Set<string>();

    // Match each incoming threat to the closest existing tracked vehicle
    for (const threat of rawThreats) {
      let bestId: string | null = null;
      let bestDiff = MATCH_DISTANCE_M;

      for (const [id, vehicle] of this.vehicles) {
        if (matched.has(id)) {
          continue;
        }
        const diff = Math.abs(vehicle.distance - threat.distance);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestId = id;
        }
      }

      if (bestId !== null) {
        // Existing vehicle — refresh its state
        const v = this.vehicles.get(bestId)!;
        v.distance = threat.distance;
        v.speed = threat.speed;
        v.level = threat.level;
        v.missedPackets = 0;
        matched.add(bestId);
      } else {
        // New vehicle not seen before
        const id = `v${this.nextId++}`;
        this.vehicles.set(id, {
          id,
          distance: threat.distance,
          speed: threat.speed,
          level: threat.level,
          missedPackets: 0,
        });
        matched.add(id);
      }
    }

    // Age out vehicles that weren't seen in this packet
    for (const [id, vehicle] of this.vehicles) {
      if (!matched.has(id)) {
        vehicle.missedPackets += 1;
        if (vehicle.missedPackets >= EVICTION_PACKETS) {
          this.vehicles.delete(id);
        }
      }
    }

    return Array.from(this.vehicles.values()).map(v => ({
      distance: v.distance,
      speed: v.speed,
      level: v.level,
    }));
  }

  /** Reset all tracked vehicles — call on disconnect or radar service restart. */
  reset(): void {
    this.vehicles.clear();
  }

  /** Visible for testing only. */
  get trackedCount(): number {
    return this.vehicles.size;
  }
}

import {VehicleTracker} from '../ble/VehicleTracker';
import {ThreatLevel} from '../ble/types';

const medium = ThreatLevel.Medium;
const high = ThreatLevel.High;

function threat(distance: number, speed = 10, level = medium) {
  return {distance, speed, level};
}

describe('VehicleTracker', () => {
  let tracker: VehicleTracker;

  beforeEach(() => {
    tracker = new VehicleTracker();
  });

  // ---------------------------------------------------------------------------
  // Basic tracking
  // ---------------------------------------------------------------------------

  it('returns empty array for empty packet', () => {
    expect(tracker.update([])).toEqual([]);
    expect(tracker.trackedCount).toBe(0);
  });

  it('adds a new vehicle on first appearance', () => {
    const result = tracker.update([threat(100)]);
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBe(100);
    expect(tracker.trackedCount).toBe(1);
  });

  it('updates existing vehicle in next packet (same distance)', () => {
    tracker.update([threat(100)]);
    const result = tracker.update([threat(100)]);
    // Still only 1 vehicle — same car
    expect(result).toHaveLength(1);
    expect(tracker.trackedCount).toBe(1);
  });

  it('updates existing vehicle as it approaches (distance decreasing)', () => {
    tracker.update([threat(100)]);
    tracker.update([threat(85)]);   // approached 15 m
    const result = tracker.update([threat(70)]);
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBe(70);
    expect(tracker.trackedCount).toBe(1);
  });

  it('detects a genuinely new second vehicle as separate', () => {
    tracker.update([threat(100)]);
    // New car appears at 40 m — far enough from 100 m to be distinct
    const result = tracker.update([threat(100), threat(40)]);
    expect(result).toHaveLength(2);
    expect(tracker.trackedCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Dropout persistence (the key fix)
  // ---------------------------------------------------------------------------

  it('holds a vehicle through 1 missed packet (BLE noise)', () => {
    tracker.update([threat(100)]);
    // Car disappears for 1 packet
    const result = tracker.update([]);
    expect(result).toHaveLength(1);  // still tracked
    expect(tracker.trackedCount).toBe(1);
  });

  it('holds a vehicle through 2 consecutive missed packets', () => {
    tracker.update([threat(100)]);
    tracker.update([]);
    const result = tracker.update([]);
    expect(result).toHaveLength(1);  // still tracked after 2 misses
    expect(tracker.trackedCount).toBe(1);
  });

  it('evicts vehicle after 3 consecutive missed packets', () => {
    tracker.update([threat(100)]);
    tracker.update([]);
    tracker.update([]);
    const result = tracker.update([]); // 3rd miss — evicted
    expect(result).toHaveLength(0);
    expect(tracker.trackedCount).toBe(0);
  });

  it('does not re-announce after dropout — count stays stable', () => {
    // Simulate the real-world bug: car drops for 1 packet then reappears
    tracker.update([threat(100)]);         // car appears → count = 1
    const duringDropout = tracker.update([]); // BLE dropout → still 1 (not 0)
    const afterReturn = tracker.update([threat(85)]); // car back → still 1

    expect(duringDropout).toHaveLength(1);  // held during dropout
    expect(afterReturn).toHaveLength(1);    // same car, count unchanged
    expect(tracker.trackedCount).toBe(1);
  });

  it('resets missed packet counter when vehicle reappears after dropout', () => {
    tracker.update([threat(100)]);
    tracker.update([]);              // miss 1
    tracker.update([threat(80)]);   // reappears — missedPackets reset to 0
    tracker.update([]);              // miss 1 again
    tracker.update([]);              // miss 2
    const result = tracker.update([]); // miss 3 — should evict now (not earlier)
    expect(result).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Matching accuracy
  // ---------------------------------------------------------------------------

  it('matches car within 30 m window', () => {
    tracker.update([threat(100)]);
    // Car moved 29 m closer — within match window
    const result = tracker.update([threat(71)]);
    expect(result).toHaveLength(1);  // same car
    expect(tracker.trackedCount).toBe(1);
  });

  it('treats car beyond 30 m delta as a new vehicle', () => {
    tracker.update([threat(100)]);
    // Distance jumped 35 m — outside match window, treated as new car
    const result = tracker.update([threat(65)]);
    expect(result).toHaveLength(2);  // old (held) + new
    expect(tracker.trackedCount).toBe(2);
  });

  it('does not double-match one incoming threat to two vehicles', () => {
    // Two tracked vehicles close together
    tracker.update([threat(100), threat(70)]);
    // Next packet has one threat at 85 — should match one of them, not both
    const result = tracker.update([threat(85)]);
    // One vehicle matched (updated), one vehicle missed (held for now)
    expect(result).toHaveLength(2); // both still tracked
    expect(tracker.trackedCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Threat level updates
  // ---------------------------------------------------------------------------

  it('updates threat level when vehicle escalates', () => {
    tracker.update([threat(100, 10, medium)]);
    const result = tracker.update([threat(90, 12, high)]);
    expect(result[0].level).toBe(high);
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  it('reset clears all tracked vehicles', () => {
    tracker.update([threat(100), threat(50)]);
    tracker.reset();
    expect(tracker.trackedCount).toBe(0);
    expect(tracker.update([])).toEqual([]);
  });

  it('accepts new vehicles after reset', () => {
    tracker.update([threat(100)]);
    tracker.reset();
    const result = tracker.update([threat(60)]);
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBe(60);
  });

  // ---------------------------------------------------------------------------
  // Multiple vehicles with independent lifecycle
  // ---------------------------------------------------------------------------

  it('tracks two cars independently — one passes while other remains', () => {
    tracker.update([threat(120), threat(50)]);
    // Close car passes (drops from packet), far car still approaching
    tracker.update([threat(105)]);   // miss 1 for close car
    tracker.update([threat(90)]);    // miss 2 for close car
    const result = tracker.update([threat(75)]); // miss 3 for close car — evicted
    expect(result).toHaveLength(1);  // only far car remains
    expect(result[0].distance).toBe(75);
  });
});

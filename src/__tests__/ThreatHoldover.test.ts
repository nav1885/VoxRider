import {ThreatHoldover} from '../ble/ThreatHoldover';
import {ThreatLevel, Threat} from '../ble/types';

const med = (distance = 80): Threat => ({speed: 10, distance, level: ThreatLevel.Medium});
const high = (distance = 40): Threat => ({speed: 25, distance, level: ThreatLevel.High});

describe('ThreatHoldover', () => {
  let updates: Threat[][];
  let holdover: ThreatHoldover;

  beforeEach(() => {
    jest.useFakeTimers();
    updates = [];
    holdover = new ThreatHoldover(t => updates.push([...t]));
  });

  afterEach(() => jest.useRealTimers());

  describe('immediate propagation', () => {
    it('propagates first threat immediately (0→N is always immediate)', () => {
      holdover.feed([med()]);
      expect(updates).toHaveLength(1);
      expect(updates[0]).toHaveLength(1);
    });

    it('propagates escalation (same count, higher level) immediately', () => {
      holdover.feed([med()]);
      holdover.feed([high()]);
      expect(updates).toHaveLength(2);
      expect(updates[1][0].level).toBe(ThreatLevel.High);
    });
  });

  describe('increase holdover (N→M where N > 0)', () => {
    it('does not propagate N→M increase immediately when N > 0', () => {
      holdover.feed([med()]);       // 0→1: immediate
      holdover.feed([med(), med(60)]); // 1→2: held
      expect(updates).toHaveLength(1); // stable still shows 1 car
    });

    it('commits the increase after INCREASE_HOLD_MS when count stays high', () => {
      holdover.feed([med()]);
      holdover.feed([med(), med(60)]);
      expect(updates).toHaveLength(1);
      jest.advanceTimersByTime(1501);
      expect(updates).toHaveLength(2);
      expect(updates[1]).toHaveLength(2);
    });

    it('cancels the increase hold when count falls back to stable', () => {
      holdover.feed([med()]);
      holdover.feed([med(), med(60)]); // 1→2: increase hold starts
      holdover.feed([med(75)]);        // back to 1 — phantom confirmed
      jest.advanceTimersByTime(2000);  // hold would have fired here
      // Should never have committed the 2-car state
      updates.forEach(u => expect(u.length).toBeLessThanOrEqual(1));
      // Latest update is 1 car (position update)
      expect(updates[updates.length - 1]).toHaveLength(1);
    });

    it('cancels the increase hold when count drops below stable', () => {
      holdover.feed([med()]);
      holdover.feed([med(), med(60)]); // 1→2: increase hold starts
      holdover.feed([]);               // 0 < stable(1) → decrease hold, increase hold cancelled
      jest.advanceTimersByTime(2000);  // decrease hold fires
      // Should have committed 0 (clear), never 2
      const counts = updates.map(u => u.length);
      expect(counts).not.toContain(2);
    });

    it('tracks the highest count during the hold window', () => {
      holdover.feed([med()]);                  // 0→1: immediate
      holdover.feed([med(), med(60)]);         // 1→2: hold starts
      holdover.feed([med(), med(60), med(50)]); // 1→3: update pending (still N>0 hold)
      jest.advanceTimersByTime(1501);
      // Should commit 3, not 2
      expect(updates[updates.length - 1]).toHaveLength(3);
    });

    it('RTL515 phantom 2-slot bug: 1 physical car never triggers "2 cars"', () => {
      // Simulate RTL515 oscillating between 1 and 2 slots for a single car
      holdover.feed([med(120)]); // 0→1: immediate — "1 car approaching"
      holdover.feed([med(110), med(110)]); // 1→2: hold starts
      holdover.feed([med(100)]);           // 1→2 hold cancelled — back to 1
      holdover.feed([med(90), med(90)]);   // hold starts again
      holdover.feed([med(80)]);            // hold cancelled again
      jest.advanceTimersByTime(2000);
      // Should never have committed 2 cars
      updates.forEach(u => expect(u.length).toBeLessThanOrEqual(1));
    });
  });

  describe('holdover on count drop', () => {
    it('does not propagate immediately when count drops', () => {
      holdover.feed([med()]);
      holdover.feed([]);
      expect(updates).toHaveLength(1); // still showing 1 car
    });

    it('propagates after 2s hold when count stays low', () => {
      holdover.feed([med()]);
      holdover.feed([]);
      jest.advanceTimersByTime(2001);
      expect(updates).toHaveLength(2);
      expect(updates[1]).toHaveLength(0); // now clear
    });

    it('cancels hold when count recovers before 2s', () => {
      holdover.feed([med()]);
      holdover.feed([]);
      jest.advanceTimersByTime(1000);
      holdover.feed([med(70)]); // car reappears
      jest.advanceTimersByTime(1500);
      // Should have updated to 1 car, not to 0
      const lastUpdate = updates[updates.length - 1];
      expect(lastUpdate).toHaveLength(1);
    });

    it('the VehicleTracker "2 cars from 1" bug does not happen', () => {
      // 1 physical car, dropout for 2 packets, then reappears at new distance
      holdover.feed([med(80)]);   // car at 80m
      holdover.feed([]);           // dropout
      holdover.feed([]);           // dropout
      holdover.feed([med(50)]);   // car reappears at 50m — different distance

      // Should always show 1 car — never 2
      updates.forEach(u => expect(u.length).toBeLessThanOrEqual(1));
      // Latest stable = 1 car (hold not yet expired)
      const last = updates[updates.length - 1];
      expect(last).toHaveLength(1);
    });

    it('holds the pending count — takes the last value seen when timer fires', () => {
      holdover.feed([med(), med(60)]);  // 0→2: immediate (stableCount was 0)
      holdover.feed([med()]);           // drops to 1 — hold starts, no emit
      expect(updates).toHaveLength(1);  // still showing 2 cars, not 1
      jest.advanceTimersByTime(500);
      holdover.feed([]);                // drops to 0 — updates pending, no emit
      expect(updates).toHaveLength(1);  // still no new emit
      jest.advanceTimersByTime(2001);   // hold fires with 0
      const last = updates[updates.length - 1];
      expect(last).toHaveLength(0);
    });
  });

  describe('pass-through eviction (distance ≤ 30m)', () => {
    it('evicts immediately when car was close on count drop', () => {
      holdover.feed([med(25)]); // car at 25m — within pass threshold
      holdover.feed([]);        // car disappears (passed)
      // Should evict immediately — no 2s hold
      expect(updates).toHaveLength(2);
      expect(updates[1]).toHaveLength(0);
    });

    it('holds when car was far on count drop', () => {
      holdover.feed([med(80)]); // car at 80m — mid-road dropout
      holdover.feed([]);
      // Should NOT evict immediately
      expect(updates).toHaveLength(1);
      jest.advanceTimersByTime(2001);
      expect(updates).toHaveLength(2);
      expect(updates[1]).toHaveLength(0);
    });

    it('evicts immediately at exactly 30m boundary', () => {
      holdover.feed([med(30)]); // right on the threshold
      holdover.feed([]);
      expect(updates).toHaveLength(2);
      expect(updates[1]).toHaveLength(0);
    });
  });

  describe('same-count updates', () => {
    it('propagates position/speed changes when count is stable', () => {
      holdover.feed([med(80)]);
      holdover.feed([med(70)]); // same count, car moved closer
      expect(updates).toHaveLength(2);
      expect(updates[1][0].distance).toBe(70);
    });
  });

  describe('reset', () => {
    it('clears state and cancels both holds on reset', () => {
      holdover.feed([med()]);
      holdover.feed([]); // decrease hold starts
      holdover.reset();
      jest.advanceTimersByTime(3000); // hold should NOT fire
      // Only updates: initial feed + reset's empty emit
      const empties = updates.filter(u => u.length === 0);
      expect(empties).toHaveLength(1); // only the reset one
    });

    it('cancels increase hold on reset', () => {
      holdover.feed([med()]);
      holdover.feed([med(), med(60)]); // increase hold starts
      holdover.reset();
      jest.advanceTimersByTime(2000); // hold should NOT fire
      // Only update: initial 0→1 feed + reset's empty emit
      const twoCarUpdates = updates.filter(u => u.length === 2);
      expect(twoCarUpdates).toHaveLength(0);
    });
  });
});

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
    it('propagates first threat immediately', () => {
      holdover.feed([med()]);
      expect(updates).toHaveLength(1);
      expect(updates[0]).toHaveLength(1);
    });

    it('propagates count increase immediately', () => {
      holdover.feed([med()]);
      holdover.feed([med(), med(60)]);
      expect(updates).toHaveLength(2);
      expect(updates[1]).toHaveLength(2);
    });

    it('propagates escalation immediately', () => {
      holdover.feed([med()]);
      holdover.feed([high()]);
      expect(updates).toHaveLength(2);
      expect(updates[1][0].level).toBe(ThreatLevel.High);
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
      holdover.feed([med(), med(60)]);  // 2 cars
      holdover.feed([med()]);           // drops to 1 — hold starts
      jest.advanceTimersByTime(500);
      holdover.feed([]);                // drops to 0 — updates pending
      jest.advanceTimersByTime(2001);   // hold fires with 0
      const last = updates[updates.length - 1];
      expect(last).toHaveLength(0);
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
    it('clears state and cancels hold on reset', () => {
      holdover.feed([med()]);
      holdover.feed([]); // hold starts
      holdover.reset();
      jest.advanceTimersByTime(3000); // hold should NOT fire
      // Only updates: initial feed + reset's empty emit
      const empties = updates.filter(u => u.length === 0);
      expect(empties).toHaveLength(1); // only the reset one
    });
  });
});

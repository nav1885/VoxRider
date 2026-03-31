import {Units} from './types';

const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;
const FEET_PER_MILE = METERS_PER_MILE / METERS_PER_FOOT;

/**
 * Format a distance value (raw meters from BLE) into a display string.
 * Format: no space between value and unit — "40ft", "120m", "0.3mi", "0.5km"
 */
export function formatDistance(meters: number, units: Units): string {
  if (units === 'metric') {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${Math.round(meters)}m`;
  }

  // Imperial
  const feet = meters / METERS_PER_FOOT;
  if (feet >= FEET_PER_MILE) {
    return `${(feet / FEET_PER_MILE).toFixed(1)}mi`;
  }
  return `${Math.round(feet)}ft`;
}

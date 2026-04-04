import {Threat, ThreatLevel, ConnectionStatus} from '../ble/types';
import {useRadarStore} from '../ble/radarStore';
import {ThreatHoldover} from '../ble/ThreatHoldover';

/**
 * DebugSimulator — simulates occasional traffic on a quiet road.
 *
 * Spawns bursts of 1–3 vehicles with 1–2s between each car in the group,
 * then a long 8–15s gap before the next group. Vehicles start at ~200–255m,
 * approach at their speed, and disappear when they pass the rider (distance ≤ 0).
 *
 * Tick rate: 300ms (matches real Varia BLE update rate).
 */

const TICK_MS = 300;
const MAX_CONCURRENT = 4;

// Probability of dropping a tick entirely (simulates BLE packet loss)
const DROPOUT_PROBABILITY = 0.12; // ~12% — realistic for BLE in the field

// Gap between cars within a burst
const INTRA_BURST_MIN_MS = 2000;
const INTRA_BURST_MAX_MS = 4000;

// Clear gap between bursts — 5–10s with no cars
const INTER_BURST_MIN_MS = 5000;
const INTER_BURST_MAX_MS = 10000;

interface SimVehicle {
  id: number;
  distance: number; // meters, decreasing
  speed: number; // m/s
  level: ThreatLevel;
}

// Vehicle templates — realistic cycling scenarios
const VEHICLE_TEMPLATES = [
  {speed: 8, level: ThreatLevel.Medium}, // slow car ~29 km/h
  {speed: 12, level: ThreatLevel.Medium}, // moderate ~43 km/h
  {speed: 16, level: ThreatLevel.High}, // fast ~58 km/h
  {speed: 20, level: ThreatLevel.High}, // very fast ~72 km/h
  {speed: 25, level: ThreatLevel.High}, // speeding ~90 km/h
  {speed: 6, level: ThreatLevel.Medium}, // truck ~22 km/h
];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class DebugSimulator {
  private vehicles: SimVehicle[] = [];
  private nextId = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private spawnTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private prevConnectionStatus: ConnectionStatus | null = null;
  private holdover = new ThreatHoldover(threats => {
    useRadarStore.getState().setThreats(threats);
  });

  start(): void {
    if (this.running) return;
    this.running = true;
    this.vehicles = [];
    this.nextId = 0;

    const store = useRadarStore.getState();
    this.prevConnectionStatus = store.connectionStatus;
    store.setConnectionStatus(ConnectionStatus.Connected);

    this.tickTimer = setInterval(() => this._tick(), TICK_MS);

    // Kick off first burst immediately
    this._scheduleBurst();
  }

  stop(): void {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.spawnTimer) {
      clearTimeout(this.spawnTimer);
      this.spawnTimer = null;
    }
    this.vehicles = [];
    this.holdover.reset();
    if (this.prevConnectionStatus !== null) {
      useRadarStore.getState().setConnectionStatus(this.prevConnectionStatus);
      this.prevConnectionStatus = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private _tick(): void {
    // Simulate BLE packet dropout — drop this tick entirely with some probability
    if (Math.random() < DROPOUT_PROBABILITY) {
      return;
    }

    const dt = TICK_MS / 1000;
    this.vehicles = this.vehicles
      .map(v => ({...v, distance: v.distance - v.speed * dt}))
      .filter(v => v.distance > 0);

    const threats: Threat[] = this.vehicles.map(v => ({
      speed: v.speed,
      distance: Math.round(v.distance),
      level: v.level,
    }));

    // Route through ThreatHoldover — same path as real BLE packets
    this.holdover.feed(threats);
  }

  private _spawnVehicle(): void {
    const template =
      VEHICLE_TEMPLATES[Math.floor(Math.random() * VEHICLE_TEMPLATES.length)];
    this.vehicles.push({
      id: this.nextId++,
      distance: rand(100, 130),
      speed: template.speed,
      level: template.level,
    });
  }

  // Spawn a burst of `remaining` cars with intra-burst spacing, then schedule next burst
  private _spawnBurst(remaining: number): void {
    if (!this.running) return;
    this._spawnVehicle();
    remaining--;

    if (remaining > 0) {
      // Next car in this burst
      const delay = rand(INTRA_BURST_MIN_MS, INTRA_BURST_MAX_MS);
      this.spawnTimer = setTimeout(() => this._spawnBurst(remaining), delay);
    } else {
      // Burst done — wait for road to clear, then next burst
      this._scheduleNextBurst();
    }
  }

  private _scheduleBurst(): void {
    if (!this.running) return;
    const available = MAX_CONCURRENT - this.vehicles.length;
    if (available <= 0) {
      // Road is full — wait before trying again
      this._scheduleNextBurst();
      return;
    }
    const groupSize = Math.min(Math.floor(rand(1, 4)), available); // 1–3, capped
    this._spawnBurst(groupSize);
  }

  private _scheduleNextBurst(): void {
    if (!this.running) return;
    const delay = rand(INTER_BURST_MIN_MS, INTER_BURST_MAX_MS);
    this.spawnTimer = setTimeout(() => this._scheduleBurst(), delay);
  }
}

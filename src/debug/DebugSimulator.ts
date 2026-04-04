import {Threat, ThreatLevel, ConnectionStatus} from '../ble/types';
import {useRadarStore} from '../ble/radarStore';
import {ThreatHoldover} from '../ble/ThreatHoldover';
import {ACTIVE_DEVICE} from '../ble/deviceProfiles';
import {TrafficMode} from '../settings/types';

/**
 * DebugSimulator — multi-car, smooth movement, traffic density modes.
 *
 * Physics (position advance) runs every tick regardless of BLE dropout.
 * Only the holdover.feed() call is skipped during simulated dropouts —
 * this matches real BLE behaviour and produces smooth car movement.
 *
 * Traffic density is controlled by TrafficMode:
 *   quiet    — 1 car at a time, long gaps
 *   busy     — 1–3 cars, moderate gaps
 *   very_busy — 2–5 cars, short gaps
 *
 * Tick rate and spawn distance are derived from the active device profile.
 */

const TICK_MS = ACTIVE_DEVICE.bleTickMs;
const SPAWN_DISTANCE_M = ACTIVE_DEVICE.maxRangeMetres;

// Probability of dropping a BLE packet (simulates real-world dropout)
const DROPOUT_PROBABILITY = 0.12; // ~12%

interface TrafficProfile {
  maxConcurrent: number;
  burstMin: number;
  burstMax: number;
  intraBurstMinMs: number;
  intraBurstMaxMs: number;
  interBurstMinMs: number;
  interBurstMaxMs: number;
}

const TRAFFIC_PROFILES: Record<TrafficMode, TrafficProfile> = {
  quiet: {
    maxConcurrent: 1,
    burstMin: 1,
    burstMax: 1,
    intraBurstMinMs: 0,
    intraBurstMaxMs: 0,
    interBurstMinMs: 5000,
    interBurstMaxMs: 10000,
  },
  busy: {
    maxConcurrent: 3,
    burstMin: 1,
    burstMax: 2,
    intraBurstMinMs: 1500,
    intraBurstMaxMs: 3000,
    interBurstMinMs: 2000,
    interBurstMaxMs: 5000,
  },
  very_busy: {
    maxConcurrent: 5,
    burstMin: 2,
    burstMax: 4,
    intraBurstMinMs: 500,
    intraBurstMaxMs: 1500,
    interBurstMinMs: 500,
    interBurstMaxMs: 2000,
  },
};

// Vehicle templates — realistic cycling scenarios
const VEHICLE_TEMPLATES = [
  {speed: 8,  level: ThreatLevel.Medium}, // ~29 km/h — slow car
  {speed: 12, level: ThreatLevel.Medium}, // ~43 km/h — moderate
  {speed: 16, level: ThreatLevel.High},   // ~58 km/h — fast
  {speed: 22, level: ThreatLevel.High},   // ~79 km/h — very fast
  {speed: 28, level: ThreatLevel.High},   // ~101 km/h — speeding
];

interface SimVehicle {
  id: number;
  distance: number; // metres, decreasing
  speed: number;    // m/s
  level: ThreatLevel;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class DebugSimulator {
  private vehicles: SimVehicle[] = [];
  private nextId = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private spawnTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private trafficMode: TrafficMode = 'quiet';
  private prevConnectionStatus: ConnectionStatus | null = null;
  private holdover = new ThreatHoldover(threats => {
    useRadarStore.getState().setThreats(threats);
  });

  setTrafficMode(mode: TrafficMode): void {
    if (this.trafficMode === mode) return;
    this.trafficMode = mode;
    // Reschedule the next burst immediately so the new density takes effect
    // without waiting for the current inter-burst timer to expire.
    if (this.running && this.spawnTimer !== null) {
      clearTimeout(this.spawnTimer);
      this.spawnTimer = null;
      this._scheduleBurst();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.vehicles = [];
    this.nextId = 0;

    const store = useRadarStore.getState();
    this.prevConnectionStatus = store.connectionStatus;
    store.setConnectionStatus(ConnectionStatus.Connected);

    this.tickTimer = setInterval(() => this._tick(), TICK_MS);
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
    // Always advance physics — position moves regardless of BLE dropout
    this.vehicles = this.vehicles
      .map(v => ({...v, distance: v.distance - v.speed * (TICK_MS / 1000)}))
      .filter(v => v.distance > 0);

    // Simulate BLE packet dropout — skip the send, not the physics
    if (Math.random() < DROPOUT_PROBABILITY) {
      return;
    }

    const threats: Threat[] = this.vehicles.map(v => ({
      speed: v.speed,
      distance: Math.round(v.distance),
      level: v.level,
    }));

    this.holdover.feed(threats);
  }

  private _spawnVehicle(): void {
    const template = VEHICLE_TEMPLATES[Math.floor(Math.random() * VEHICLE_TEMPLATES.length)];
    this.vehicles.push({
      id: this.nextId++,
      distance: SPAWN_DISTANCE_M,
      speed: template.speed,
      level: template.level,
    });
  }

  private _scheduleBurst(): void {
    if (!this.running) return;
    const profile = TRAFFIC_PROFILES[this.trafficMode];
    const available = profile.maxConcurrent - this.vehicles.length;
    if (available <= 0) {
      this._scheduleNextBurst();
      return;
    }
    // Integer in [burstMin, burstMax] inclusive, capped by available slots
    const size = Math.min(
      profile.burstMin + Math.floor(Math.random() * (profile.burstMax - profile.burstMin + 1)),
      available,
    );
    this._spawnBurst(size, profile);
  }

  private _spawnBurst(remaining: number, profile: TrafficProfile): void {
    if (!this.running) return;
    this._spawnVehicle();
    remaining--;

    if (remaining > 0) {
      const delay = rand(profile.intraBurstMinMs, profile.intraBurstMaxMs);
      this.spawnTimer = setTimeout(() => this._spawnBurst(remaining, profile), delay);
    } else {
      this._scheduleNextBurst();
    }
  }

  private _scheduleNextBurst(): void {
    if (!this.running) return;
    const profile = TRAFFIC_PROFILES[this.trafficMode];
    const delay = rand(profile.interBurstMinMs, profile.interBurstMaxMs);
    this.spawnTimer = setTimeout(() => this._scheduleBurst(), delay);
  }
}

import {Threat, ThreatLevel, RadarPacket} from './types';

const REASSEMBLY_TIMEOUT_MS = 500;

// Split packet reassembly buffer — keyed by sequence ID
interface PartialPacket {
  threats: Threat[];
  timer: ReturnType<typeof setTimeout>;
}
const partialPackets = new Map<number, PartialPacket>();

/**
 * Parse a raw BLE radar notification from the Garmin Varia.
 *
 * Packet format:
 *   Byte 0: [sequence_id: upper 4 bits][threat_count: lower 4 bits]
 *   Per threat (3 bytes):
 *     Byte 0: speed (uint8 m/s)
 *     Byte 1: distance (uint8 meters, 0–255)
 *     Byte 2: flags (bits 7–6 = threat level: 0=none,1=medium,2=high,3=unknown)
 *
 * Split packets (>6 threats exceed 20-byte BLE MTU) share a sequence ID.
 * They are reassembled within REASSEMBLY_TIMEOUT_MS (500ms).
 *
 * Returns null if packet is incomplete (waiting for split reassembly).
 * Returns RadarPacket with empty threats array for idle/clear (1-byte packet).
 */
export function parseRadarPacket(bytes: Uint8Array): RadarPacket | null {
  if (bytes.length === 0) {
    return null;
  }

  // 1-byte idle packet = clear state
  if (bytes.length === 1) {
    return {sequenceId: 0, threats: []};
  }

  const header = bytes[0];
  const sequenceId = (header >> 4) & 0x0f;
  const threatCount = header & 0x0f;

  const threats: Threat[] = [];
  const maxThreats = Math.min(threatCount, Math.floor((bytes.length - 1) / 3));

  for (let i = 0; i < maxThreats; i++) {
    const offset = 1 + i * 3;
    if (offset + 2 >= bytes.length) {
      break;
    }
    const speed = bytes[offset];
    const distance = bytes[offset + 1];
    const flags = bytes[offset + 2];
    const rawLevel = (flags >> 6) & 0x03;
    const level = rawLevel as ThreatLevel;

    threats.push({speed, distance, level});
  }

  // Check if a prior fragment with this sequence ID is buffered — if so, merge
  const existing = partialPackets.get(sequenceId);
  if (existing) {
    clearTimeout(existing.timer);
    partialPackets.delete(sequenceId);
    return {sequenceId, threats: [...existing.threats, ...threats]};
  }

  // Check if this packet is the first fragment of a split (promises more than it carries)
  const isSplit = threatCount > maxThreats;
  if (isSplit) {
    const timer = setTimeout(() => {
      partialPackets.delete(sequenceId);
    }, REASSEMBLY_TIMEOUT_MS);
    partialPackets.set(sequenceId, {threats, timer});
    return null;
  }

  return {sequenceId, threats};
}

/** Extract threat level from flags byte (bits 7–6) */
export function parseThreatLevel(flags: number): ThreatLevel {
  return ((flags >> 6) & 0x03) as ThreatLevel;
}

/** Resolve Unknown threat level to Medium (conservative default) */
export function resolveThreatLevel(level: ThreatLevel): ThreatLevel {
  return level === ThreatLevel.Unknown ? ThreatLevel.Medium : level;
}

/** Get the highest effective threat level across all threats */
export function getMaxThreatLevel(threats: Threat[]): ThreatLevel {
  if (threats.length === 0) {
    return ThreatLevel.None;
  }
  return threats.reduce<ThreatLevel>((max, t) => {
    const resolved = resolveThreatLevel(t.level);
    return resolved > max ? resolved : max;
  }, ThreatLevel.None);
}

import {Threat, ThreatLevel, RadarPacket} from './types';

/**
 * Parse a raw BLE radar notification from the Garmin Varia RTL515/516.
 *
 * Packet format (empirically verified against real hardware + forum sources):
 *   Byte 0: header — upper 4 bits = rolling counter (informational only)
 *                    lower 4 bits = always 0x2 (protocol constant, NOT threat count)
 *   Per threat (3 bytes each):
 *     Byte 0: vehicleId — uint8, constant per physical vehicle across packets
 *     Byte 1: distance  — uint8 meters (decreases as vehicle approaches)
 *     Byte 2: speed     — uint8 km/h; bits 7-6 encode threat level:
 *               00 = None, 01 = Medium, 10 = High, 11 = Unknown
 *
 * Threat count is derived solely from packet length: (length - 1) / 3
 * The lower nibble of the header is NOT a threat count — never use it as one.
 *
 * Returns null for empty byte arrays.
 * Returns RadarPacket with empty threats array for 1-byte idle/clear packets.
 *
 * Canonical test vectors (Varia RTL515 demo mode, 2025-04):
 *   82 A5 76 58 AE 89 44  → 2 threats: {vId=0xA5,d=118m,s=88kmh,M} {vId=0xAE,d=137m,s=68kmh,M}
 *   82 AE 2B 44           → 1 threat:  {vId=0xAE,d=43m,s=68kmh,M}
 *   82                    → 0 threats (clear)
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

  // Count from length — lower nibble is always 0x2, never a count
  const threatCount = Math.floor((bytes.length - 1) / 3);

  const threats: Threat[] = [];

  for (let i = 0; i < threatCount; i++) {
    const offset = 1 + i * 3;
    if (offset + 2 >= bytes.length) {
      break;
    }
    const vehicleId = bytes[offset];
    const distance = bytes[offset + 1];
    const speedRaw = bytes[offset + 2];
    const rawLevel = (speedRaw >> 6) & 0x03;
    const level = rawLevel as ThreatLevel;

    threats.push({vehicleId, speed: speedRaw, distance, level});
  }

  return {sequenceId, threats};
}

/** Extract threat level from speed byte (bits 7–6) */
export function parseThreatLevel(speedByte: number): ThreatLevel {
  return ((speedByte >> 6) & 0x03) as ThreatLevel;
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

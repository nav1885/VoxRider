import {parseRadarPacket, getMaxThreatLevel, resolveThreatLevel} from '../ble/parseRadarPacket';
import {ThreatLevel} from '../ble/types';

/**
 * Byte format (Garmin Varia RTL515, empirically verified):
 *   Header byte: upper nibble = rolling counter, lower nibble = 0x2 (always)
 *   Per threat [vehicleId, distance_m, speed_kmh]:
 *     - vehicleId: uint8, constant per physical vehicle
 *     - distance:  uint8 meters
 *     - speed:     uint8 km/h; bits 7-6 → level (00=none,01=medium,10=high,11=unknown)
 *
 * Threat level from speed byte:
 *   Medium (01): speed 64–127 km/h  e.g. 68 km/h = 0x44, 88 km/h = 0x58
 *   High   (10): speed 128–191 km/h e.g. 130 km/h = 0x82, 160 km/h = 0xA0
 *   None   (00): speed 0–63 km/h    e.g. 30 km/h = 0x1E
 */

describe('parseRadarPacket', () => {
  describe('idle/clear packet', () => {
    it('returns empty threats for 1-byte idle packet', () => {
      const result = parseRadarPacket(new Uint8Array([0x82]));
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(0);
    });

    it('returns null for empty bytes', () => {
      expect(parseRadarPacket(new Uint8Array([]))).toBeNull();
    });
  });

  describe('single threat packet', () => {
    it('parses one medium-speed threat', () => {
      // Header: rolling=1, lower=2 → 0x12
      // Threat: vehicleId=0x0A, distance=80m, speed=0x44=68 km/h (bits 7-6=01=medium)
      const bytes = new Uint8Array([0x12, 0x0A, 80, 0x44]);
      const result = parseRadarPacket(bytes);
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(1);
      expect(result!.threats[0]).toEqual({vehicleId: 0x0A, distance: 80, speed: 0x44, level: ThreatLevel.Medium});
    });

    it('parses one high-speed threat', () => {
      // speed=0x82=130 km/h (bits 7-6=10=high)
      const bytes = new Uint8Array([0x12, 0x0B, 40, 0x82]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0]).toEqual({vehicleId: 0x0B, distance: 40, speed: 0x82, level: ThreatLevel.High});
    });

    it('parses unknown threat level', () => {
      // speed=0xC0=192 km/h (bits 7-6=11=unknown)
      const bytes = new Uint8Array([0x12, 0x0C, 60, 0xC0]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0].level).toBe(ThreatLevel.Unknown);
    });

    it('parses max distance (255m)', () => {
      const bytes = new Uint8Array([0x12, 0x01, 255, 0x44]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0].distance).toBe(255);
    });

    it('parses max speed byte (255)', () => {
      const bytes = new Uint8Array([0x12, 0x01, 100, 0xFF]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0].speed).toBe(255);
    });
  });

  describe('multi-threat packet', () => {
    it('parses 2 threats at different distances', () => {
      // Header: rolling=5, lower=2 → 0x52
      const bytes = new Uint8Array([
        0x52,
        0x0A, 30,  0x82, // vehicleId=10, 30m, 130 km/h, high
        0x0B, 80,  0x44, // vehicleId=11, 80m,  68 km/h, medium
      ]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats).toHaveLength(2);
      expect(result!.threats[0]).toEqual({vehicleId: 0x0A, distance: 30, speed: 0x82, level: ThreatLevel.High});
      expect(result!.threats[1]).toEqual({vehicleId: 0x0B, distance: 80, speed: 0x44, level: ThreatLevel.Medium});
    });

    it('parses 3 threats', () => {
      const bytes = new Uint8Array([
        0x32,
        0x01, 30,  0x82, // high
        0x02, 80,  0x44, // medium
        0x03, 150, 0x44, // medium
      ]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats).toHaveLength(3);
    });

    it('ignores incomplete trailing bytes', () => {
      // 1 full threat + 2 extra bytes (incomplete second threat)
      const bytes = new Uint8Array([0x12, 0x01, 80, 0x44, 0x02, 60]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats).toHaveLength(1);
    });
  });

  describe('canonical hardware captures (Varia RTL515 demo mode)', () => {
    it('parses 2-threat demo packet', () => {
      // Captured: 82 A5 76 58 AE 89 44
      const bytes = new Uint8Array([0x82, 0xA5, 0x76, 0x58, 0xAE, 0x89, 0x44]);
      const result = parseRadarPacket(bytes);
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(2);
      expect(result!.threats[0]).toEqual({vehicleId: 0xA5, distance: 0x76, speed: 0x58, level: ThreatLevel.Medium});
      expect(result!.threats[1]).toEqual({vehicleId: 0xAE, distance: 0x89, speed: 0x44, level: ThreatLevel.Medium});
    });

    it('parses 1-threat demo packet', () => {
      // Captured: 82 AE 2B 44
      const bytes = new Uint8Array([0x82, 0xAE, 0x2B, 0x44]);
      const result = parseRadarPacket(bytes);
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(1);
      expect(result!.threats[0]).toEqual({vehicleId: 0xAE, distance: 0x2B, speed: 0x44, level: ThreatLevel.Medium});
    });

    it('parses clear packet (1-byte)', () => {
      const bytes = new Uint8Array([0x82]);
      const result = parseRadarPacket(bytes);
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(0);
    });

    it('preserves rolling counter in sequenceId', () => {
      // Header 0x82: upper nibble=8
      const result = parseRadarPacket(new Uint8Array([0x82, 0xAE, 0x2B, 0x44]));
      expect(result!.sequenceId).toBe(8);
    });

    it('lower nibble=2 does NOT trigger split packet logic', () => {
      // This was the critical bug: lower nibble=2 was misread as threatCount=2
      // causing 4-byte single-threat packets to be classified as split and dropped.
      // Now count is derived from length only — 4 bytes → 1 threat.
      const bytes = new Uint8Array([0x82, 0xAE, 0x2B, 0x44]);
      const result = parseRadarPacket(bytes);
      expect(result).not.toBeNull(); // must NOT return null (was the bug)
      expect(result!.threats).toHaveLength(1);
    });
  });
});

describe('getMaxThreatLevel', () => {
  it('returns None for empty threats', () => {
    expect(getMaxThreatLevel([])).toBe(ThreatLevel.None);
  });

  it('returns High when one threat is high', () => {
    const threats = [
      {speed: 0x44, distance: 80, level: ThreatLevel.Medium},
      {speed: 0x82, distance: 40, level: ThreatLevel.High},
    ];
    expect(getMaxThreatLevel(threats)).toBe(ThreatLevel.High);
  });

  it('treats Unknown as Medium', () => {
    const threats = [{speed: 0xC0, distance: 80, level: ThreatLevel.Unknown}];
    expect(getMaxThreatLevel(threats)).toBe(ThreatLevel.Medium);
  });

  it('returns Medium when all are medium', () => {
    const threats = [
      {speed: 0x44, distance: 80, level: ThreatLevel.Medium},
      {speed: 0x58, distance: 60, level: ThreatLevel.Medium},
    ];
    expect(getMaxThreatLevel(threats)).toBe(ThreatLevel.Medium);
  });
});

describe('resolveThreatLevel', () => {
  it('resolves Unknown to Medium', () => {
    expect(resolveThreatLevel(ThreatLevel.Unknown)).toBe(ThreatLevel.Medium);
  });

  it('passes through Medium unchanged', () => {
    expect(resolveThreatLevel(ThreatLevel.Medium)).toBe(ThreatLevel.Medium);
  });

  it('passes through High unchanged', () => {
    expect(resolveThreatLevel(ThreatLevel.High)).toBe(ThreatLevel.High);
  });
});

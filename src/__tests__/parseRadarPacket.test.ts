import {parseRadarPacket, getMaxThreatLevel, resolveThreatLevel} from '../ble/parseRadarPacket';
import {ThreatLevel} from '../ble/types';

describe('parseRadarPacket', () => {
  describe('idle/clear packet', () => {
    it('returns empty threats for 1-byte idle packet', () => {
      const result = parseRadarPacket(new Uint8Array([0x00]));
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(0);
    });

    it('returns null for empty bytes', () => {
      expect(parseRadarPacket(new Uint8Array([]))).toBeNull();
    });
  });

  describe('single threat packet', () => {
    it('parses one medium-speed threat', () => {
      // Header: sequenceId=0, count=1 → 0x01
      // Threat: speed=10 m/s, distance=80m, flags=0x40 (bits 7-6 = 01 = medium)
      const bytes = new Uint8Array([0x01, 10, 80, 0x40]);
      const result = parseRadarPacket(bytes);
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(1);
      expect(result!.threats[0]).toEqual({speed: 10, distance: 80, level: ThreatLevel.Medium});
    });

    it('parses one high-speed threat', () => {
      // flags=0x80 (bits 7-6 = 10 = high)
      const bytes = new Uint8Array([0x01, 25, 40, 0x80]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0]).toEqual({speed: 25, distance: 40, level: ThreatLevel.High});
    });

    it('parses unknown threat level', () => {
      // flags=0xC0 (bits 7-6 = 11 = unknown)
      const bytes = new Uint8Array([0x01, 15, 60, 0xc0]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0].level).toBe(ThreatLevel.Unknown);
    });

    it('parses max distance (255m)', () => {
      const bytes = new Uint8Array([0x01, 5, 255, 0x40]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0].distance).toBe(255);
    });

    it('parses max speed', () => {
      const bytes = new Uint8Array([0x01, 255, 100, 0x80]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats[0].speed).toBe(255);
    });
  });

  describe('multi-threat packet', () => {
    it('parses 3 threats at different distances', () => {
      // Header: count=3 → 0x03
      const bytes = new Uint8Array([
        0x03,
        25, 30, 0x80,  // high, 30m
        15, 80, 0x40,  // medium, 80m
        10, 150, 0x40, // medium, 150m
      ]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats).toHaveLength(3);
      expect(result!.threats[0]).toEqual({speed: 25, distance: 30, level: ThreatLevel.High});
      expect(result!.threats[1]).toEqual({speed: 15, distance: 80, level: ThreatLevel.Medium});
      expect(result!.threats[2]).toEqual({speed: 10, distance: 150, level: ThreatLevel.Medium});
    });

    it('parses 6 threats (max per single packet)', () => {
      const threatBytes: number[] = [];
      for (let i = 0; i < 6; i++) {
        threatBytes.push(10 + i, 50 + i * 10, 0x40);
      }
      const bytes = new Uint8Array([0x06, ...threatBytes]);
      const result = parseRadarPacket(bytes);
      expect(result!.threats).toHaveLength(6);
    });
  });

  describe('split packet reassembly', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns null for first fragment and full result on second', () => {
      // sequenceId=1, first fragment has 6 threats but header says more
      const firstFragment = new Uint8Array([
        0x18, // sequenceId=1, count=8 (>6, so split)
        10, 30, 0x80,
        12, 50, 0x40,
        14, 70, 0x40,
        16, 90, 0x40,
        18, 110, 0x40,
        20, 130, 0x40,
      ]);
      const secondFragment = new Uint8Array([
        0x12, // sequenceId=1, count=2 (remaining)
        22, 150, 0x40,
        24, 170, 0x40,
      ]);

      const firstResult = parseRadarPacket(firstFragment);
      expect(firstResult).toBeNull(); // buffered, waiting

      const secondResult = parseRadarPacket(secondFragment);
      expect(secondResult).not.toBeNull();
      expect(secondResult!.threats).toHaveLength(8);
    });

    it('discards partial packet after 500ms timeout', () => {
      const fragment = new Uint8Array([
        0x28, // sequenceId=2, count=8 (split)
        10, 30, 0x80,
        12, 50, 0x40,
        14, 70, 0x40,
        16, 90, 0x40,
        18, 110, 0x40,
        20, 130, 0x40,
      ]);

      parseRadarPacket(fragment); // buffers fragment

      // Advance past timeout
      jest.advanceTimersByTime(501);

      // A new packet with same sequenceId should now start fresh (not merge)
      const newPacket = new Uint8Array([0x21, 5, 200, 0x40]); // sequenceId=2, count=1
      const result = parseRadarPacket(newPacket);
      expect(result).not.toBeNull();
      expect(result!.threats).toHaveLength(1); // not merged with discarded fragment
    });
  });
});

describe('getMaxThreatLevel', () => {
  it('returns None for empty threats', () => {
    expect(getMaxThreatLevel([])).toBe(ThreatLevel.None);
  });

  it('returns High when one threat is high', () => {
    const threats = [
      {speed: 10, distance: 80, level: ThreatLevel.Medium},
      {speed: 25, distance: 40, level: ThreatLevel.High},
    ];
    expect(getMaxThreatLevel(threats)).toBe(ThreatLevel.High);
  });

  it('treats Unknown as Medium', () => {
    const threats = [{speed: 10, distance: 80, level: ThreatLevel.Unknown}];
    expect(getMaxThreatLevel(threats)).toBe(ThreatLevel.Medium);
  });

  it('returns Medium when all are medium', () => {
    const threats = [
      {speed: 10, distance: 80, level: ThreatLevel.Medium},
      {speed: 12, distance: 60, level: ThreatLevel.Medium},
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

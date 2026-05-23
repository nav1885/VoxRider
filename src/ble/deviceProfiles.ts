/**
 * Radar device profiles.
 *
 * Each profile captures the physical and BLE characteristics of a supported
 * radar device. Add a new entry here to support additional hardware — the
 * simulator and BLE manager both derive their behaviour from the active profile.
 */

export interface RadarDeviceProfile {
  /** Human-readable model name */
  name: string;
  /** BLE advertisement name prefix used to identify the device during scan */
  namePrefix: string;
  /** Maximum detection range in metres */
  maxRangeMetres: number;
  /** BLE notification interval in milliseconds (inverse of update rate) */
  bleTickMs: number;
  /** Radar data service UUID */
  serviceUuid: string;
  /** Radar data characteristic UUID */
  radarCharUuid: string;
}

export const RTL_RADAR: RadarDeviceProfile = {
  name: 'Cycling Radar',
  namePrefix: 'RTL',
  maxRangeMetres: 140,
  bleTickMs: 1000,
  serviceUuid: '6A4E3200-667B-11E3-949A-0800200C9A66',
  radarCharUuid: '6A4E3203-667B-11E3-949A-0800200C9A66',
};

/** All supported profiles — used for scan filtering */
export const SUPPORTED_DEVICES: RadarDeviceProfile[] = [RTL_RADAR];

/** Active profile — change this to switch the target device */
export const ACTIVE_DEVICE = RTL_RADAR;

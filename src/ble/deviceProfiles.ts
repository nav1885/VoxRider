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

export const VARIA_RTL515: RadarDeviceProfile = {
  name: 'Garmin Varia RTL515',
  namePrefix: 'RTL',
  maxRangeMetres: 140,
  bleTickMs: 1000,
  serviceUuid: '6A4E3200-667B-11E3-949A-0800200C9A66',
  radarCharUuid: '6A4E3203-667B-11E3-949A-0800200C9A66',
};

// Add future devices here, e.g.:
// export const VARIA_RVR315: RadarDeviceProfile = { ... };

/** All supported profiles — used for scan filtering */
export const SUPPORTED_DEVICES: RadarDeviceProfile[] = [VARIA_RTL515];

/** Active profile — change this to switch the target device */
export const ACTIVE_DEVICE = VARIA_RTL515;

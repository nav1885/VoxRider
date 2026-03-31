import {useState, useCallback} from 'react';
import {Platform, PermissionsAndroid} from 'react-native';

export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'blocked';

interface BluetoothPermissionHook {
  status: PermissionStatus;
  request: () => Promise<PermissionStatus>;
}

/**
 * useBluetoothPermission — requests BLE permissions at the correct API level.
 *
 * Android 12+ (API 31+): BLUETOOTH_SCAN + BLUETOOTH_CONNECT
 * Android 11 and below:  ACCESS_FINE_LOCATION
 * iOS: permissions are granted implicitly when CBCentralManager initialises — no JS request needed.
 *
 * Returns:
 *  - 'granted'  — all required permissions granted, proceed to scan
 *  - 'denied'   — denied but can ask again (show explanation + retry)
 *  - 'blocked'  — permanently denied (show "Open Settings" button)
 *  - 'unknown'  — not yet requested
 */
export function useBluetoothPermission(): BluetoothPermissionHook {
  const [status, setStatus] = useState<PermissionStatus>('unknown');

  const request = useCallback(async (): Promise<PermissionStatus> => {
    if (Platform.OS !== 'android') {
      // iOS: no JS permission request; system handles it on first BLE use
      setStatus('granted');
      return 'granted';
    }

    const apiLevel = Platform.Version as number;

    let result: PermissionStatus;

    if (apiLevel >= 31) {
      // Android 12+ — request BLUETOOTH_SCAN + BLUETOOTH_CONNECT
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      const scanResult = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
      const connectResult = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];

      if (
        scanResult === PermissionsAndroid.RESULTS.GRANTED &&
        connectResult === PermissionsAndroid.RESULTS.GRANTED
      ) {
        result = 'granted';
      } else if (
        scanResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
        connectResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ) {
        result = 'blocked';
      } else {
        result = 'denied';
      }
    } else {
      // Android 11 and below — request ACCESS_FINE_LOCATION
      const locationResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );

      if (locationResult === PermissionsAndroid.RESULTS.GRANTED) {
        result = 'granted';
      } else if (locationResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        result = 'blocked';
      } else {
        result = 'denied';
      }
    }

    setStatus(result);
    return result;
  }, []);

  return {status, request};
}

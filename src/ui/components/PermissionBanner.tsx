import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Linking} from 'react-native';
import {PermissionStatus} from '../../permissions/useBluetoothPermission';
import {Strings} from '../../constants/strings';

interface Props {
  status: PermissionStatus;
  onRetry: () => void;
}

/**
 * PermissionBanner — shown on PairingStep2 when BLE permission is denied or blocked.
 *
 * denied: explanation + Retry button (can ask again)
 * blocked: explanation + Open Settings button (permanently denied)
 */
export function PermissionBanner({status, onRetry}: Props): React.JSX.Element | null {
  if (status !== 'denied' && status !== 'blocked') {
    return null;
  }

  const openSettings = () => {
    Linking.openSettings();
  };

  return (
    <View style={styles.banner} testID="permission-banner">
      <Text style={styles.text} testID="permission-banner-text">
        {Strings.bluetoothPermissionRationale}
      </Text>

      {status === 'blocked' ? (
        <TouchableOpacity
          testID="permission-open-settings"
          style={styles.button}
          onPress={openSettings}>
          <Text style={styles.buttonText}>{Strings.bluetoothPermissionButton}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          testID="permission-retry"
          style={styles.button}
          onPress={onRetry}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 16,
    gap: 12,
    marginTop: 16,
  },
  text: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

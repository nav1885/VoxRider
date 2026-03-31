import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import {DeviceInfo, IBLEManager} from '../../ble/types';
import {Strings} from '../../constants/strings';

const SCAN_TIMEOUT_MS = 30000;

type ScanState = 'scanning' | 'found' | 'timeout' | 'connecting' | 'error';

interface Props {
  bleManager: IBLEManager;
  onConnected: (device: DeviceInfo) => void;
}

export function PairingStep2({bleManager, onConnected}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startScan = () => {
    setScanState('scanning');
    setDevices([]);
    setConnectError(null);
    setSelectedDeviceId(null);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    // Timeout starts when scan begins
    scanTimeoutRef.current = setTimeout(() => {
      setScanState(prev => (prev === 'scanning' ? 'timeout' : prev));
    }, SCAN_TIMEOUT_MS);

    bleManager.scan().then(found => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      if (found.length === 0) {
        setScanState('timeout');
      } else {
        // Sort by RSSI descending (strongest = closest)
        const sorted = [...found].sort((a, b) => b.rssi - a.rssi);
        setDevices(sorted);
        setScanState('found');
      }
    });
  };

  useEffect(() => {
    startScan();
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeviceTap = async (device: DeviceInfo) => {
    setSelectedDeviceId(device.id);
    setConnectError(null);
    setScanState('connecting');
    try {
      await bleManager.connect(device.id);
      onConnected(device);
    } catch {
      setScanState('found');
      setConnectError(Strings.pairingStep2ConnectError);
      setSelectedDeviceId(null);
    }
  };

  const textStyle = isDark ? styles.textDark : styles.text;

  return (
    <SafeAreaView
      style={[styles.container, isDark && styles.containerDark]}
      testID="pairing-step2">
      <View style={styles.content}>
        <Text style={styles.progress} testID="step-progress">
          {Strings.pairingStep2Progress}
        </Text>

        <Text style={[styles.title, textStyle]} testID="step-title">
          {Strings.pairingStep2Title}
        </Text>

        {/* Scanning state */}
        {scanState === 'scanning' && (
          <View style={styles.scanningContainer} testID="scanning-indicator">
            <ActivityIndicator size="large" color={isDark ? '#F9FAFB' : '#111827'} />
            <Text style={[styles.scanningText, textStyle]}>
              {Strings.pairingStep2Searching}
            </Text>
          </View>
        )}

        {/* Timeout state */}
        {scanState === 'timeout' && (
          <View style={styles.timeoutContainer} testID="timeout-message">
            <Text style={[styles.timeoutText, textStyle]}>
              {Strings.pairingStep2NotFound}
            </Text>
            <TouchableOpacity
              testID="try-again-button"
              style={styles.tryAgainButton}
              onPress={startScan}>
              <Text style={styles.tryAgainText}>{Strings.pairingStep2TryAgain}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Connect error */}
        {connectError && (
          <Text style={styles.errorText} testID="connect-error">
            {connectError}
          </Text>
        )}

        {/* Device list */}
        {(scanState === 'found' || scanState === 'connecting' || scanState === 'error') && (
          <FlatList
            testID="device-list"
            data={devices}
            keyExtractor={item => item.id}
            renderItem={({item}) => (
              <TouchableOpacity
                testID={`device-item-${item.id}`}
                style={[
                  styles.deviceItem,
                  selectedDeviceId === item.id && styles.deviceItemSelected,
                ]}
                onPress={() => handleDeviceTap(item)}
                disabled={scanState === 'connecting'}>
                <Text style={[styles.deviceName, textStyle]}>
                  {Strings.pairingStep2DeviceName}
                </Text>
                <Text style={styles.deviceId}>{item.id}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFFFFF'},
  containerDark: {backgroundColor: '#111827'},
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  progress: {fontSize: 13, color: '#9CA3AF', marginBottom: 8},
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 32,
  },
  text: {color: '#111827'},
  textDark: {color: '#F9FAFB'},
  scanningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  scanningText: {fontSize: 16, textAlign: 'center'},
  timeoutContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  timeoutText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#374151',
  },
  tryAgainButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  tryAgainText: {color: '#FFFFFF', fontSize: 16, fontWeight: '600'},
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginBottom: 12,
    textAlign: 'center',
  },
  deviceItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  deviceItemSelected: {
    borderColor: '#111827',
    backgroundColor: '#F3F4F6',
  },
  deviceName: {fontSize: 16, fontWeight: '600', marginBottom: 2},
  deviceId: {fontSize: 12, color: '#9CA3AF'},
});

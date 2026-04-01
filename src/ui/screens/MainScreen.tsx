import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useRadarStore} from '../../ble/radarStore';
import {useSettingsStore} from '../../settings/settingsStore';
import {ConnectionStatus, ThreatLevel} from '../../ble/types';
import {getMaxThreatLevel} from '../../ble/parseRadarPacket';
import {RadarStrip} from '../components/RadarStrip';
import {formatDistance} from '../../settings/formatDistance';
import {Strings} from '../../constants/strings';

interface Props {
  onTestAlert: () => void;
  onSwipeLeft?: () => void;
}

export function MainScreen({onTestAlert, onSwipeLeft}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';

  const threats = useRadarStore(s => s.threats);
  const connectionStatus = useRadarStore(s => s.connectionStatus);
  const connectedDevice = useRadarStore(s => s.connectedDevice);
  const batteryLevel = useRadarStore(s => s.batteryLevel);
  const consecutiveFailures = useRadarStore(s => s.consecutiveFailures);

  const sidebarPosition = useSettingsStore(s => s.sidebarPosition);
  const units = useSettingsStore(s => s.units);

  const isConnected = connectionStatus === ConnectionStatus.Connected;
  const maxLevel = getMaxThreatLevel(threats);
  const showConflictHint = consecutiveFailures >= 3;

  // Connection status line
  const connectionLabel =
    isConnected && connectedDevice
      ? Strings.connected(connectedDevice.name)
      : connectionStatus === ConnectionStatus.Scanning ||
          connectionStatus === ConnectionStatus.Reconnecting
        ? Strings.searching
        : Strings.disconnected;

  // Center threat display
  const threatLabel =
    threats.length === 0
      ? Strings.clear
      : Strings.vehiclesDisplay(
          threats.length,
          formatDistance(Math.min(...threats.map(t => t.distance)), units),
        );

  const threatColor =
    threats.length === 0
      ? (isDark ? '#16A34A' : '#22C55E')
      : maxLevel === ThreatLevel.High
        ? (isDark ? '#DC2626' : '#EF4444')
        : (isDark ? '#EA6B0D' : '#F97316');

  // Battery bar
  const showBattery = batteryLevel !== null;
  const batteryLow = batteryLevel !== null && batteryLevel <= 10;

  const mainPadding = sidebarPosition === 'left' ? {paddingLeft: 52} : {paddingRight: 52};

  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .onEnd(e => {
      if (e.translationX < -60 && Math.abs(e.translationY) < 80) {
        onSwipeLeft?.();
      }
    });

  return (
    <GestureDetector gesture={swipeGesture}>
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} testID="main-screen">
      <RadarStrip threats={threats} position={sidebarPosition} />

      <View style={[styles.main, mainPadding]}>
        {/* Connection status */}
        <View testID="connection-status-row">
          <Text style={[styles.connectionStatus, isDark && styles.textDark]} testID="connection-status">
            {connectionLabel}
          </Text>
          {showConflictHint && (
            <View testID="conflict-hint" style={styles.conflictBanner}>
              <Text style={styles.conflictText}>{Strings.conflictHint}</Text>
            </View>
          )}
        </View>

        {/* Center: threat state */}
        <View style={styles.centerContent}>
          <Text
            testID="threat-label"
            style={[styles.threatLabel, {color: threatColor}]}>
            {threatLabel}
          </Text>
        </View>

        {/* Battery */}
        {showBattery && (
          <View testID="battery-row" style={styles.batteryRow}>
            <View style={styles.batteryBarOuter}>
              <View
                testID="battery-bar"
                style={[
                  styles.batteryBarInner,
                  {
                    width: `${batteryLevel}%`,
                    backgroundColor: batteryLow ? '#EF4444' : (isDark ? '#9CA3AF' : '#6B7280'),
                  },
                ]}
              />
            </View>
            <Text style={[styles.batteryText, isDark && styles.textDark]}>
              {batteryLevel}%
            </Text>
          </View>
        )}

        {/* Test Alert */}
        <TouchableOpacity
          testID="test-alert-button"
          style={styles.testAlertButton}
          onPress={onTestAlert}>
          <Text style={styles.testAlertText}>{Strings.testAlertButton}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  containerDark: {
    backgroundColor: '#111827',
  },
  main: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  connectionStatus: {
    fontSize: 14,
    color: '#374151',
  },
  textDark: {
    color: '#D1D5DB',
  },
  conflictBanner: {
    marginTop: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    padding: 8,
  },
  conflictText: {
    fontSize: 13,
    color: '#92400E',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  threatLabel: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  batteryBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  batteryBarInner: {
    height: '100%',
    borderRadius: 3,
  },
  batteryText: {
    fontSize: 12,
    color: '#6B7280',
    minWidth: 36,
    textAlign: 'right',
  },
  testAlertButton: {
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  testAlertButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  testAlertText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

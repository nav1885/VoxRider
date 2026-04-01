import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useRadarStore} from '../../ble/radarStore';
import {useSettingsStore} from '../../settings/settingsStore';
import {ConnectionStatus, ThreatLevel} from '../../ble/types';
import {getMaxThreatLevel} from '../../ble/parseRadarPacket';
import {RadarStrip} from '../components/RadarStrip';
import {formatDistance} from '../../settings/formatDistance';
import {Strings} from '../../constants/strings';
import {DebugSimulator} from '../../debug/DebugSimulator';

interface Props {
  onSwipeLeft?: () => void;
}

export function MainScreen({onSwipeLeft}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const threats = useRadarStore(s => s.threats);
  const connectionStatus = useRadarStore(s => s.connectionStatus);
  const connectedDevice = useRadarStore(s => s.connectedDevice);
  const batteryLevel = useRadarStore(s => s.batteryLevel);
  const consecutiveFailures = useRadarStore(s => s.consecutiveFailures);

  const sidebarPosition = useSettingsStore(s => s.sidebarPosition);
  const units = useSettingsStore(s => s.units);
  const debugMode = useSettingsStore(s => s.debugMode);
  const debugLastAnnouncement = useRadarStore(s => s.debugLastAnnouncement);
  const debugTTSLog = useRadarStore(s => s.debugTTSLog);
  const simulatorRef = useRef(new DebugSimulator());
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    const sim = simulatorRef.current;
    return () => sim.stop();
  }, []);

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
    <View style={[styles.container, isDark && styles.containerDark]} testID="main-screen">
      <RadarStrip threats={threats} position={sidebarPosition} />

      <View style={[styles.main, mainPadding, {paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24}]}>
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

        {/* Debug TTS indicator */}
        {debugMode && (
          <View style={{marginBottom: 4}}>
            {debugLastAnnouncement !== '' && (
              <Text style={{color: '#6B7280', fontSize: 12, textAlign: 'center'}}>
                announced: "{debugLastAnnouncement}"
              </Text>
            )}
            {debugTTSLog !== '' && (
              <Text style={{color: '#9CA3AF', fontSize: 10, textAlign: 'center'}}>
                {debugTTSLog}
              </Text>
            )}
          </View>
        )}

        {/* Debug Simulate */}
        {debugMode && (
          <TouchableOpacity
            testID="debug-simulate-button"
            style={[styles.simButton, {backgroundColor: simRunning ? '#DC2626' : '#16A34A', marginBottom: 10}]}
            onPress={() => {
              const sim = simulatorRef.current;
              if (sim.isRunning()) {
                sim.stop();
                setSimRunning(false);
              } else {
                sim.start();
                setSimRunning(true);
              }
            }}>
            <Text style={styles.simButtonText}>
              {simRunning ? 'Stop Simulation' : 'Simulate Threats'}
            </Text>
          </TouchableOpacity>
        )}

      </View>
    </View>
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
    justifyContent: 'space-between',
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
  simButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  simButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

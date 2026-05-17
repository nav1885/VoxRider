/**
 * AppHeader — permanent top slot.
 *
 * Left  : connection status dot + device name
 * Center: VoxRider logo (7-tap Easter egg unlocks debug mode)
 * Right : battery pill icon + percentage
 */

import React, {useEffect, useRef} from 'react';
import {Animated, View, Text, Image, Platform, ToastAndroid, StyleSheet, useColorScheme} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {ConnectionStatus} from '../../ble/types';
import {useSettingsStore} from '../../settings/settingsStore';

const logo = require('../../assets/logo.png');

const DEBUG_TAP_COUNT_ON  = 7;
const DEBUG_TAP_COUNT_OFF = 5;
const DEBUG_TAP_WINDOW_MS = 8000;

// ─── Battery pill ─────────────────────────────────────────────────────────────

function BatteryPill({level, isDark}: {level: number | null; isDark: boolean}): React.JSX.Element {
  const fillColor =
    level === null ? '#6B7280'
    : level <= 10  ? '#EF4444'
    : level <= 30  ? '#F59E0B'
    :                '#22C55E';

  const fillWidth = level === null ? 0 : Math.max(2, (level / 100) * 26);

  return (
    <View testID="battery-row" style={battSt.wrap}>
      <View style={[battSt.shell, isDark && battSt.shellDark]}>
        <View testID="battery-bar" style={[battSt.fill, {width: fillWidth, backgroundColor: fillColor}]}/>
      </View>
      <View style={[battSt.nub, isDark && battSt.nubDark]}/>
      <Text style={[battSt.label, isDark && battSt.labelDark]}>
        {level !== null ? `${level}%` : '—'}
      </Text>
    </View>
  );
}

const battSt = StyleSheet.create({
  wrap: {flexDirection: 'row', alignItems: 'center', gap: 5},
  shell: {
    width: 30, height: 14,
    borderRadius: 3,
    borderWidth: 1.5, borderColor: '#9CA3AF',
    padding: 2,
    justifyContent: 'center',
  },
  shellDark: {borderColor: '#6B7280'},
  fill: {height: '100%', borderRadius: 1.5},
  nub: {
    width: 3, height: 7,
    backgroundColor: '#9CA3AF',
    borderRadius: 1,
    marginLeft: -1,
  },
  nubDark: {backgroundColor: '#6B7280'},
  label: {fontSize: 12, color: '#374151', fontVariant: ['tabular-nums']},
  labelDark: {color: '#D1D5DB'},
});

// ─── Connection status dot (pulses while scanning) ────────────────────────────

function StatusDot({status}: {status: ConnectionStatus}): React.JSX.Element {
  const pulse = useRef(new Animated.Value(1)).current;
  const scanning =
    status === ConnectionStatus.Scanning || status === ConnectionStatus.Reconnecting;

  useEffect(() => {
    if (scanning) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {toValue: 0.25, duration: 600, useNativeDriver: true}),
          Animated.timing(pulse, {toValue: 1,    duration: 600, useNativeDriver: true}),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [scanning, pulse]);

  const color =
    status === ConnectionStatus.Connected    ? '#22C55E'
    : scanning                               ? '#F59E0B'
    :                                          '#6B7280';

  return (
    <Animated.View
      style={[dotSt.dot, {backgroundColor: color, opacity: pulse}]}
    />
  );
}

const dotSt = StyleSheet.create({
  dot: {width: 8, height: 8, borderRadius: 4},
});

// ─── AppHeader ────────────────────────────────────────────────────────────────

interface Props {
  connectionStatus: ConnectionStatus;
  deviceName: string | null;
  batteryLevel: number | null;
}

export function AppHeader({connectionStatus, deviceName, batteryLevel}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const debugMode    = useSettingsStore(s => s.debugMode);
  const setDebugMode = useSettingsStore(s => s.setDebugMode);
  const tapCount    = useRef(0);
  const lastTapTime = useRef(0);

  const deviceLabel =
    connectionStatus === ConnectionStatus.Connected && deviceName
      ? deviceName
      : connectionStatus === ConnectionStatus.Scanning ||
        connectionStatus === ConnectionStatus.Reconnecting
      ? 'Searching…'
      : 'No device';

  const iconColor = isDark ? '#E5E7EB' : '#1F2937';
  const subColor  = isDark ? '#9CA3AF' : '#6B7280';

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      const now = Date.now();
      if (now - lastTapTime.current > DEBUG_TAP_WINDOW_MS) {
        tapCount.current = 0;
      }
      lastTapTime.current = now;
      tapCount.current += 1;
      const threshold = debugMode ? DEBUG_TAP_COUNT_OFF : DEBUG_TAP_COUNT_ON;
      if (tapCount.current >= threshold) {
        tapCount.current = 0;
        const next = !debugMode;
        setDebugMode(next);
        if (Platform.OS === 'android') {
          ToastAndroid.show(
            next ? 'Debug mode enabled' : 'Debug mode disabled',
            ToastAndroid.SHORT,
          );
        }
      }
    });

  return (
    <View style={[hSt.container, isDark ? hSt.containerDark : hSt.containerLight]}>

      {/* ── Left: connection status ── */}
      <View style={hSt.side}>
        <View style={hSt.statusRow}>
          <StatusDot status={connectionStatus} />
          <Text testID="connection-device" style={[hSt.deviceName, {color: iconColor}]} numberOfLines={1}>
            {deviceLabel}
          </Text>
        </View>
        <Text testID="connection-status" style={[hSt.statusSub, {color: subColor}]}>
          {connectionStatus === ConnectionStatus.Connected ? 'Connected' : 'Radar'}
        </Text>
        {debugMode && <Text style={[hSt.devBadge, {color: subColor}]}>·DEV·</Text>}
      </View>

      {/* ── Center: logo (7-tap Easter egg unlocks debug mode) ── */}
      <View style={hSt.center}>
        <GestureDetector gesture={tap}>
          <Image testID="header-wordmark" source={logo} style={hSt.logo} resizeMode="contain" />
        </GestureDetector>
      </View>

      {/* ── Right: battery ── */}
      <View style={[hSt.side, hSt.sideRight]}>
        <BatteryPill level={batteryLevel} isDark={isDark} />
        <Text style={[hSt.statusSub, {color: subColor}]}>Battery</Text>
      </View>

    </View>
  );
}

const hSt = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginHorizontal: 0,
    marginBottom: 8,
    borderRadius: 16,
  },
  containerLight: {
    backgroundColor: '#F3F4F6',
  },
  containerDark: {
    backgroundColor: '#1F2937',
  },

  // Left / right panels
  side: {
    flex: 1,
    gap: 3,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  statusSub: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  devBadge: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    opacity: 0.4,
  },

  // Center
  center: {justifyContent: 'center', alignItems: 'center'},
  logo: {width: 90, height: 60},
});

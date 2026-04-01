/**
 * AppHeader — permanent top slot.
 *
 * Left  : connection status dot + device name
 * Center: minimal SVG bike + VOXRIDER wordmark
 * Right : battery pill icon + percentage
 */

import React, {useEffect, useRef} from 'react';
import {Animated, View, Text, StyleSheet, useColorScheme} from 'react-native';
import Svg, {Circle, Line, Path} from 'react-native-svg';
import {ConnectionStatus} from '../../ble/types';

// ─── Minimal side-view bicycle ────────────────────────────────────────────────

function BikeIcon({color}: {color: string}): React.JSX.Element {
  // Sourced from svgrepo.com/svg/101223/road-bicycle — rendered as stroke paths
  // to avoid fill-based native rendering issues. viewBox 0 0 406 406.
  const s = 8;
  return (
    <Svg width={48} height={48} viewBox="0 0 406 406">
      {/* Rear wheel */}
      <Circle cx={82} cy={231} r={82} fill="none" stroke={color} strokeWidth={s}/>
      {/* Front wheel */}
      <Circle cx={324} cy={231} r={82} fill="none" stroke={color} strokeWidth={s}/>
      {/* Rear hub */}
      <Circle cx={82}  cy={231} r={8} fill={color}/>
      {/* Front hub */}
      <Circle cx={324} cy={231} r={8} fill={color}/>
      {/* Chain stay */}
      <Line x1={82}  y1={231} x2={200} y2={231} stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Seat tube */}
      <Line x1={200} y1={231} x2={181} y2={123} stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Seat stays */}
      <Line x1={181} y1={123} x2={82}  y2={231} stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Top tube */}
      <Line x1={181} y1={123} x2={299} y2={123} stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Down tube */}
      <Line x1={310} y1={153} x2={200} y2={231} stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Head tube */}
      <Line x1={299} y1={123} x2={310} y2={153} stroke={color} strokeWidth={s * 2} strokeLinecap="round"/>
      {/* Fork */}
      <Line x1={310} y1={153} x2={324} y2={231} stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Chainring */}
      <Circle cx={200} cy={231} r={28} fill="none" stroke={color} strokeWidth={s}/>
      {/* Seat post */}
      <Line x1={181} y1={123} x2={181} y2={70}  stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Saddle */}
      <Line x1={148} y1={70}  x2={214} y2={70}  stroke={color} strokeWidth={s * 2} strokeLinecap="round"/>
      {/* Stem */}
      <Line x1={299} y1={123} x2={348} y2={70}  stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Bar top */}
      <Line x1={332} y1={70}  x2={372} y2={70}  stroke={color} strokeWidth={s} strokeLinecap="round"/>
      {/* Drop near */}
      <Path d="M372,70 C390,85 390,120 372,126" stroke={color} strokeWidth={s} strokeLinecap="round" fill="none"/>
      {/* Drop far */}
      <Path d="M332,70 C314,85 314,116 332,122" stroke={color} strokeWidth={s * 0.8} strokeLinecap="round" fill="none"/>
    </Svg>
  );
}

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

  const deviceLabel =
    connectionStatus === ConnectionStatus.Connected && deviceName
      ? deviceName
      : connectionStatus === ConnectionStatus.Scanning ||
        connectionStatus === ConnectionStatus.Reconnecting
      ? 'Searching…'
      : 'No device';

  const iconColor = isDark ? '#E5E7EB' : '#1F2937';
  const subColor  = isDark ? '#9CA3AF' : '#6B7280';

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
      </View>

      {/* ── Center: bike + wordmark ── */}
      <View style={hSt.center}>
        <BikeIcon color={iconColor} />
        <Text style={[hSt.wordmark, {color: iconColor}]}>VOXRIDER</Text>
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
    paddingVertical: 10,
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

  // Center
  center: {
    alignItems: 'center',
    gap: 2,
  },
  wordmark: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },
});

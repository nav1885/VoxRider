import React, {useMemo} from 'react';
import {View, StyleSheet, useColorScheme, Dimensions} from 'react-native';
import {Threat, ThreatLevel} from '../../ble/types';
import {getMaxThreatLevel, resolveThreatLevel} from '../../ble/parseRadarPacket';
import {CarIcon} from './CarIcon';

const STRIP_WIDTH = 44;
const MAX_DISTANCE = 255;

const COLORS = {
  clear: {light: '#22C55E', dark: '#16A34A'},
  medium: {light: '#F97316', dark: '#EA6B0D'},
  high: {light: '#EF4444', dark: '#DC2626'},
};

function stripColor(maxLevel: ThreatLevel, isDark: boolean): string {
  const scheme = isDark ? 'dark' : 'light';
  switch (maxLevel) {
    case ThreatLevel.High:
      return COLORS.high[scheme];
    case ThreatLevel.Medium:
      return COLORS.medium[scheme];
    default:
      return COLORS.clear[scheme];
  }
}

interface Props {
  threats: Threat[];
  position: 'left' | 'right';
  /** Override screen height — used in tests to avoid Dimensions dependency */
  height?: number;
}

export function RadarStrip({threats, position, height}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const screenHeight = height ?? Dimensions.get('window').height;

  const maxLevel = useMemo(() => getMaxThreatLevel(threats), [threats]);
  const bgColor = stripColor(maxLevel, isDark);

  // Sort closest first (ascending distance), then map to vertical positions
  const sortedThreats = useMemo(
    () => [...threats].sort((a, b) => a.distance - b.distance),
    [threats],
  );

  return (
    <View
      testID="radar-strip"
      style={[
        styles.strip,
        {backgroundColor: bgColor, [position === 'left' ? 'left' : 'right']: 0},
      ]}>
      {sortedThreats.map((threat, index) => {
        // close=top (small top value), far=bottom (large top value)
        const topPx = (threat.distance / MAX_DISTANCE) * screenHeight;

        return (
          <View
            key={index}
            testID={`car-icon-${index}`}
            style={[styles.iconWrapper, {top: topPx}]}
            accessibilityHint={String(topPx)}>
            <CarIcon level={resolveThreatLevel(threat.level)} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: STRIP_WIDTH,
    zIndex: 10,
  },
  iconWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});

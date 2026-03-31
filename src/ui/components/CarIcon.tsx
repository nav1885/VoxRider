import React from 'react';
import {View, StyleSheet} from 'react-native';
import {ThreatLevel} from '../../ble/types';

/**
 * Simple car icon rendered as SVG-free shapes.
 * White fill on all threat level backgrounds.
 * Sized to fit within the 44pt radar strip.
 */
interface Props {
  level: ThreatLevel;
  testID?: string;
}

export function CarIcon({testID}: Props): React.JSX.Element {
  return (
    <View testID={testID ?? 'car-icon'} style={styles.car}>
      <View style={styles.roof} />
      <View style={styles.body} />
      <View style={styles.wheels}>
        <View style={styles.wheel} />
        <View style={styles.wheel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  car: {
    width: 28,
    height: 20,
    alignItems: 'center',
  },
  roof: {
    width: 16,
    height: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    marginBottom: -1,
  },
  body: {
    width: 26,
    height: 9,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  wheels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 22,
    marginTop: -2,
  },
  wheel: {
    width: 7,
    height: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 3.5,
  },
});

/**
 * DebugWordmark — VOXRIDER wordmark with hidden 7-tap Easter egg.
 *
 * Shared between AppHeader (main screen) and PairingStep1 (setup screen).
 * 7 taps within 8 s → enable debug mode.
 * 5 taps within 8 s → disable debug mode.
 */

import React, {useRef} from 'react';
import {Platform, Text, ToastAndroid, View, StyleSheet} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useSettingsStore} from '../../settings/settingsStore';

const DEBUG_TAP_COUNT_ON  = 7;
const DEBUG_TAP_COUNT_OFF = 5;
const DEBUG_TAP_WINDOW_MS = 8000;

interface Props {
  color: string;
}

export function DebugWordmark({color}: Props): React.JSX.Element {
  const debugMode   = useSettingsStore(s => s.debugMode);
  const setDebugMode = useSettingsStore(s => s.setDebugMode);
  const tapCount    = useRef(0);
  const lastTapTime = useRef(0);

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
    <GestureDetector gesture={tap}>
      <View style={st.wrap}>
        <Text style={[st.wordmark, {color}]}>VOXRIDER</Text>
        {debugMode && <Text style={[st.devBadge, {color}]}>·DEV·</Text>}
      </View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  wrap: {alignItems: 'center', gap: 2},
  wordmark: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },
  devBadge: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    opacity: 0.4,
  },
});

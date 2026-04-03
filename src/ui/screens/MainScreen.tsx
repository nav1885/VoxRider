import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ToastAndroid,
  Platform,
} from 'react-native';
import {openBugReport} from '../../utils/bugReport';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useRadarStore} from '../../ble/radarStore';
import {useSettingsStore} from '../../settings/settingsStore';
import {ConnectionStatus, ThreatLevel} from '../../ble/types';
import {getMaxThreatLevel} from '../../ble/parseRadarPacket';
import {RoadView} from '../components/RoadView';
import {Strings} from '../../constants/strings';
import {DebugSimulator} from '../../debug/DebugSimulator';
import {AppHeader} from '../components/AppHeader';

const BANNER_AUTO_DISMISS_MS = 5000;

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

  const debugMode = useSettingsStore(s => s.debugMode);
  const debugLastAnnouncement = useRadarStore(s => s.debugLastAnnouncement);
  const debugTTSLog = useRadarStore(s => s.debugTTSLog);
  const simulatorRef = useRef(new DebugSimulator());
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    const sim = simulatorRef.current;
    return () => sim.stop();
  }, []);

  const maxLevel = getMaxThreatLevel(threats);
  const isClear = threats.length === 0;
  const isHigh = maxLevel === ThreatLevel.High;
  const showConflictHint = consecutiveFailures >= 3;

  // ── Banner content ────────────────────────────────────────────────────────
  const bannerMessage = isClear
    ? Strings.bannerClear
    : Strings.bannerWarning(
        threats.length,
        isHigh ? Strings.speedHigh : Strings.speedMedium,
      );

  const bannerBg = isClear ? '#16A34A' : isHigh ? '#DC2626' : '#D97706';

  // ── Banner animation ──────────────────────────────────────────────────────
  // Hidden on mount. Shows only when:
  //   • A threat appears / changes (yellow/red)
  //   • Threats just cleared after having been active (green "All Clear", 5 s)
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerSlide = useRef(new Animated.Value(-12)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevThreatCount = useRef(0);

  useEffect(() => {
    const prev = prevThreatCount.current;
    const curr = threats.length;
    prevThreatCount.current = curr;

    const wasActive = prev > 0;
    const isActive = curr > 0;

    // Don't show on initial render when already clear
    if (!isActive && !wasActive) return;

    // Cancel any pending dismiss and slide banner back in
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    bannerOpacity.stopAnimation();
    bannerSlide.stopAnimation();
    Animated.parallel([
      Animated.timing(bannerOpacity, {toValue: 1, duration: 220, useNativeDriver: true}),
      Animated.timing(bannerSlide, {toValue: 0, duration: 220, useNativeDriver: true}),
    ]).start();

    // Always auto-dismiss after 5 s (both threat and clear banners)
    dismissTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bannerOpacity, {toValue: 0, duration: 380, useNativeDriver: true}),
        Animated.timing(bannerSlide, {toValue: -12, duration: 380, useNativeDriver: true}),
      ]).start();
    }, BANNER_AUTO_DISMISS_MS);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threats.length, maxLevel]);

  // ── Swipe gesture ─────────────────────────────────────────────────────────
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
        <View style={[styles.main, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16}]}>

          {/* ── Permanent header ── */}
          <AppHeader
            connectionStatus={connectionStatus}
            deviceName={connectedDevice?.name ?? null}
            batteryLevel={batteryLevel}
          />

          {/* ── Threat banner — full width, auto-dismisses after 5 s for threats ── */}
          <Animated.View
            style={[
              styles.banner,
              {
                backgroundColor: bannerBg,
                opacity: bannerOpacity,
                transform: [{translateY: bannerSlide}],
              },
            ]}>
            <Text style={styles.bannerIcon}>
              {isClear ? '✓' : '⚠'}
            </Text>
            <Text testID="threat-label" style={styles.bannerText} numberOfLines={1} adjustsFontSizeToFit>
              {bannerMessage}
            </Text>
          </Animated.View>

          {/* ── Road visualization ── */}
          <View style={styles.roadSection}>
            <RoadView threats={threats} />
          </View>

          {/* ── Conflict hint ── */}
          {showConflictHint && (
            <View testID="conflict-hint" style={[styles.conflictBanner, {marginHorizontal: 16, marginBottom: 6}]}>
              <Text style={styles.conflictText}>{Strings.conflictHint}</Text>
            </View>
          )}

          {/* ── Debug section ── */}
          {debugMode && (
            <View style={styles.debugSection}>
              {debugLastAnnouncement !== '' && (
                <Text style={styles.debugAnnounced}>
                  announced: "{debugLastAnnouncement}"
                </Text>
              )}
              {debugTTSLog !== '' && (
                <Text style={styles.debugTTS}>{debugTTSLog}</Text>
              )}
              <TouchableOpacity
                testID="debug-simulate-button"
                style={[styles.simButton, {backgroundColor: simRunning ? '#DC2626' : '#16A34A'}]}
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
            </View>
          )}

        </View>

        {/* ── Bug report FAB ── */}
        <TouchableOpacity
          testID="bug-report-fab"
          style={[styles.fab, {bottom: insets.bottom + 16}]}
          onPress={async () => {
            try {
              await openBugReport();
            } catch {
              if (Platform.OS === 'android') {
                ToastAndroid.show("Couldn't open browser", ToastAndroid.SHORT);
              }
            }
          }}>
          <Text style={styles.fabText}>⚑</Text>
        </TouchableOpacity>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#FFFFFF'},
  containerDark: {backgroundColor: '#111827'},

  main: {flex: 1},

  // ── Banner ──
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    // Fixed height so the road view doesn't shift when banner fades
    minHeight: 52,
  },
  bannerIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bannerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  // ── Road ──
  roadSection: {
    flex: 1,
    paddingHorizontal: 20,
  },

  conflictBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    padding: 6,
  },
  conflictText: {fontSize: 12, color: '#92400E'},

  // ── Debug ──
  debugSection: {marginTop: 10, gap: 6, paddingHorizontal: 20},
  debugAnnounced: {color: '#6B7280', fontSize: 12, textAlign: 'center'},
  debugTTS: {color: '#9CA3AF', fontSize: 10, textAlign: 'center'},
  simButton: {borderRadius: 10, paddingVertical: 14, alignItems: 'center'},
  simButtonText: {color: '#FFFFFF', fontSize: 16, fontWeight: '600'},

  // ── Bug report FAB ──
  fab: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {fontSize: 18, color: '#FFFFFF'},
});

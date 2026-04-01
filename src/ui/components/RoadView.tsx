import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  View,
  StyleSheet,
  useColorScheme,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import {Threat, ThreatLevel} from '../../ble/types';
import {resolveThreatLevel} from '../../ble/parseRadarPacket';
import {SportsCar} from './SportsCar';

const ROAD_WIDTH = 120;
const CAR_W = 44;
const CAR_H = 80;
const MAX_DISTANCE = 130;
const RIDER_RESERVE = 60;
const MAX_SLOTS = 6; // max concurrent cars to animate

function distanceToY(distance: number, roadHeight: number): number {
  const activeH = roadHeight - RIDER_RESERVE - CAR_H - 8;
  const fraction = Math.min(distance, MAX_DISTANCE) / MAX_DISTANCE;
  // 0 m → top (just below rider line), MAX m → bottom
  return RIDER_RESERVE + fraction * activeH;
}

function carColor(level: ThreatLevel): string {
  return level === ThreatLevel.High ? '#EF4444' : '#F97316';
}


// ─── Rider position line ──────────────────────────────────────────────────────

function RiderLine(): React.JSX.Element {
  return (
    <View style={riderSt.wrap}>
      <View style={riderSt.line} />
    </View>
  );
}

const riderSt = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 18,
    left: 8,
    right: 8,
  },
  line: {
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderRadius: 1.5,
  },
});

// ─── Dashed centre line ───────────────────────────────────────────────────────

function CenterLine({height}: {height: number}): React.JSX.Element {
  const DASH = 18;
  const GAP = 13;
  const step = DASH + GAP;
  const count = Math.ceil(height / step) + 1;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({length: count}, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: i * step,
            left: ROAD_WIDTH / 2 - 1.5,
            width: 3,
            height: DASH,
            backgroundColor: 'rgba(255,255,255,0.45)',
            borderRadius: 1.5,
          }}
        />
      ))}
    </View>
  );
}

// ─── RoadView ─────────────────────────────────────────────────────────────────

interface Props {
  threats: Threat[];
  height?: number; // test override
}

export function RoadView({threats, height: heightProp}: Props): React.JSX.Element {
  const isDark = useColorScheme() === 'dark';
  const {height: winH} = useWindowDimensions();

  // State so layout change triggers the animation effect to re-run
  const [measuredH, setMeasuredH] = useState(0);
  const effectiveH = heightProp ?? (measuredH > 0 ? measuredH : winH * 0.52);

  function onLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - measuredH) > 1) setMeasuredH(h);
  }

  // Fixed pool of animated Y values — one per possible car slot
  const animYs = useRef<Animated.Value[]>(
    Array.from({length: MAX_SLOTS}, () => new Animated.Value(-200)),
  ).current;

  // Track the last-known distance for each slot so we can tell if a slot
  // was reassigned to a *different* car (vs the same car moving forward).
  // Max speed 25 m/s × 0.3 s tick = 7.5 m per update — anything > 20 m jump
  // means the slot now holds a different car and must snap, not animate.
  const slotPrevDist = useRef<number[]>(Array(MAX_SLOTS).fill(-1));

  useEffect(() => {
    const sorted = [...threats].sort((a, b) => a.distance - b.distance);

    sorted.forEach((threat, i) => {
      if (i >= MAX_SLOTS) return;
      const targetY = distanceToY(threat.distance, effectiveH);
      const prev = slotPrevDist.current[i];
      const sameCar = prev >= 0 && Math.abs(threat.distance - prev) <= 20;

      slotPrevDist.current[i] = threat.distance;

      if (sameCar) {
        // Smooth animation for a car that is already on screen
        Animated.timing(animYs[i], {
          toValue: targetY,
          duration: 160,
          useNativeDriver: false,
        }).start();
      } else {
        // New car entering this slot — snap to correct position immediately
        animYs[i].stopAnimation();
        animYs[i].setValue(targetY);
      }
    });

    // Hide unused slots instantly
    for (let i = sorted.length; i < MAX_SLOTS; i++) {
      animYs[i].stopAnimation();
      animYs[i].setValue(effectiveH + 200);
      slotPrevDist.current[i] = -1; // mark slot as empty
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threats, effectiveH]);

  const sorted = [...threats].sort((a, b) => a.distance - b.distance);

  return (
    <View style={styles.container}>
      <View
        testID="road-view"
        style={[styles.road, isDark && styles.roadDark]}
        onLayout={onLayout}>

        <View style={styles.edgeL} />
        <View style={styles.edgeR} />
        <CenterLine height={effectiveH} />

        {sorted.map((threat, i) => {
          if (i >= MAX_SLOTS) return null;
          return (
            <Animated.View
              key={i}
              testID={`road-car-${i}`}
              accessibilityHint={String(distanceToY(threat.distance, effectiveH))}
              style={[
                styles.carSlot,
                {
                  top: animYs[i],
                  left: (ROAD_WIDTH - CAR_W) / 2,
                },
              ]}>
              <SportsCar level={resolveThreatLevel(threat.level)} width={CAR_W} height={CAR_H} />
            </Animated.View>
          );
        })}

        <RiderLine />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  road: {
    flex: 1,
    width: ROAD_WIDTH,
    backgroundColor: '#1A1A1E',
    borderRadius: 6,
    overflow: 'visible',
  },
  roadDark: {
    backgroundColor: '#131315',
  },
  edgeL: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.60)',
    borderRadius: 1.5,
  },
  edgeR: {
    position: 'absolute',
    top: 0, bottom: 0, right: 0,
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.60)',
    borderRadius: 1.5,
  },
  carSlot: {
    position: 'absolute',
  },
});

/**
 * SportsCar — top-down SVG illustration of a sports car.
 *
 * Orientation: nose points DOWN (approaching the rider who is at the top).
 *
 * Anatomy (top → bottom of the SVG canvas):
 *   rear bumper → rear diffuser → rear tyres → rear quarter panels →
 *   door sills → side mirrors → windshield → hood → front splitter → front tyres
 */

import React from 'react';
import Svg, {
  Path,
  Ellipse,
  Rect,
  G,
  Defs,
  LinearGradient,
  Stop,
  RadialGradient,
} from 'react-native-svg';
import {ThreatLevel} from '../../ble/types';

interface Props {
  level: ThreatLevel;
  width?: number;
  height?: number;
}

export function SportsCar({
  level,
  width = 44,
  height = 80,
}: Props): React.JSX.Element {
  const isHigh = level === ThreatLevel.High;

  // Threat colours
  const bodyFill = isHigh ? '#EF4444' : '#F97316';
  const bodyShade = isHigh ? '#B91C1C' : '#C2560A';
  const bodyHighlight = isHigh ? '#FCA5A5' : '#FDBA74';

  // Scale everything off a 44×80 canvas
  const W = 44;
  const H = 80;
  const scaleX = width / W;
  const scaleY = height / H;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      style={{overflow: 'visible'}}>
      <Defs>
        {/* Body gradient — lighter centre spine, darker edges */}
        <LinearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={bodyShade} stopOpacity="1" />
          <Stop offset="0.35" stopColor={bodyFill} stopOpacity="1" />
          <Stop offset="0.5" stopColor={bodyHighlight} stopOpacity="1" />
          <Stop offset="0.65" stopColor={bodyFill} stopOpacity="1" />
          <Stop offset="1" stopColor={bodyShade} stopOpacity="1" />
        </LinearGradient>

        {/* Glass gradient */}
        <LinearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#B8E4FF" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#7EC8F0" stopOpacity="0.7" />
        </LinearGradient>

        {/* Tyre radial */}
        <RadialGradient id="tyreGrad" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#444" stopOpacity="1" />
          <Stop offset="1" stopColor="#111" stopOpacity="1" />
        </RadialGradient>
      </Defs>

      {/* ── Shadow beneath the car ── */}
      <Ellipse cx={W / 2} cy={H / 2} rx={17} ry={36}
        fill="rgba(0,0,0,0.25)" />

      {/* ── Rear tyres (top of SVG = rear of car) ── */}
      <Rect x={0} y={10} width={8} height={16} rx={2}
        fill="url(#tyreGrad)" />
      <Rect x={W - 8} y={10} width={8} height={16} rx={2}
        fill="url(#tyreGrad)" />
      {/* Tyre rims */}
      <Ellipse cx={4} cy={18} rx={2.5} ry={4} fill="#666" />
      <Ellipse cx={W - 4} cy={18} rx={2.5} ry={4} fill="#666" />

      {/* ── Front tyres (bottom of SVG = front of car) ── */}
      <Rect x={0} y={H - 26} width={8} height={16} rx={2}
        fill="url(#tyreGrad)" />
      <Rect x={W - 8} y={H - 26} width={8} height={16} rx={2}
        fill="url(#tyreGrad)" />
      {/* Tyre rims */}
      <Ellipse cx={4} cy={H - 18} rx={2.5} ry={4} fill="#666" />
      <Ellipse cx={W - 4} cy={H - 18} rx={2.5} ry={4} fill="#666" />

      {/* ── Main body ── */}
      {/* Outer silhouette — widest at wheel arches */}
      <Path
        d={`
          M ${W / 2} 2
          C ${W / 2 - 4} 2, ${W / 2 - 10} 6, 8 12
          L 4 18
          L 3 32
          C 3 36, 3 38, 4 40
          L 4 44
          C 3 48, 3 52, 4 54
          L 3 58
          L 4 ${H - 18}
          L 8 ${H - 12}
          C ${W / 2 - 10} ${H - 4}, ${W / 2 - 4} ${H - 2}, ${W / 2} ${H - 2}
          C ${W / 2 + 4} ${H - 2}, ${W / 2 + 10} ${H - 4}, ${W - 8} ${H - 12}
          L ${W - 4} ${H - 18}
          L ${W - 3} 58
          L ${W - 4} 54
          C ${W - 3} 52, ${W - 3} 48, ${W - 4} 44
          L ${W - 4} 40
          C ${W - 3} 38, ${W - 3} 36, ${W - 3} 32
          L ${W - 4} 18
          L ${W - 8} 12
          C ${W / 2 + 10} 6, ${W / 2 + 4} 2, ${W / 2} 2
          Z
        `}
        fill="url(#bodyGrad)"
      />

      {/* ── Rear bumper / diffuser panel ── */}
      <Path
        d={`M 9 6 Q ${W / 2} 2, ${W - 9} 6 L ${W - 8} 12 Q ${W / 2} 8, 8 12 Z`}
        fill={bodyShade}
      />

      {/* ── Rear window ── */}
      <Path
        d={`M 12 14 Q ${W / 2} 11, ${W - 12} 14 L ${W - 13} 24 Q ${W / 2} 22, 13 24 Z`}
        fill="url(#glassGrad)"
        opacity={0.9}
      />

      {/* ── Roof — dark carbon-look panel ── */}
      <Path
        d={`M 11 25 Q ${W / 2} 22, ${W - 11} 25 L ${W - 11} 46 Q ${W / 2} 48, 11 46 Z`}
        fill="#1A1A1A"
      />
      {/* Roof centre spine highlight */}
      <Rect x={W / 2 - 1} y={25} width={2} height={21}
        rx={1} fill="rgba(255,255,255,0.12)" />

      {/* ── Side mirrors (small wings off the A-pillars) ── */}
      <Path d={`M 9 42 L 3 44 L 4 48 L 9 47 Z`} fill={bodyShade} />
      <Path d={`M ${W - 9} 42 L ${W - 3} 44 L ${W - 4} 48 L ${W - 9} 47 Z`}
        fill={bodyShade} />

      {/* ── Windshield ── */}
      <Path
        d={`M 11 47 Q ${W / 2} 44, ${W - 11} 47 L ${W - 12} 60 Q ${W / 2} 63, 12 60 Z`}
        fill="url(#glassGrad)"
        opacity={0.85}
      />

      {/* ── Hood / bonnet ── */}
      <Path
        d={`M 12 60 Q ${W / 2} 63, ${W - 12} 60 L ${W - 9} ${H - 12} Q ${W / 2} ${H - 6}, 9 ${H - 12} Z`}
        fill={bodyShade}
      />
      {/* Hood centre scoop / vent line */}
      <Path
        d={`M ${W / 2} 62 L ${W / 2 - 3} ${H - 14} Q ${W / 2} ${H - 12}, ${W / 2 + 3} ${H - 14} Z`}
        fill="rgba(0,0,0,0.25)"
      />

      {/* ── Front splitter ── */}
      <Path
        d={`M 8 ${H - 12} Q ${W / 2} ${H - 4}, ${W - 8} ${H - 12} L ${W - 9} ${H - 8} Q ${W / 2} ${H - 2}, 9 ${H - 8} Z`}
        fill="#1A1A1A"
      />

      {/* ── Headlights ── */}
      <Ellipse cx={10} cy={H - 10} rx={3} ry={2}
        fill={isHigh ? '#FFF' : '#FFFDE7'} opacity={0.9} />
      <Ellipse cx={W - 10} cy={H - 10} rx={3} ry={2}
        fill={isHigh ? '#FFF' : '#FFFDE7'} opacity={0.9} />

      {/* ── Rear lights ── */}
      <Ellipse cx={10} cy={14} rx={2.5} ry={1.5}
        fill={isHigh ? '#FF6B6B' : '#FF8C42'} opacity={0.9} />
      <Ellipse cx={W - 10} cy={14} rx={2.5} ry={1.5}
        fill={isHigh ? '#FF6B6B' : '#FF8C42'} opacity={0.9} />
    </Svg>
  );
}

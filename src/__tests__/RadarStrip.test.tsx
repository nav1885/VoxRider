import React from 'react';
import {render} from '@testing-library/react-native';
import {RadarStrip} from '../ui/components/RadarStrip';
import {ThreatLevel, Threat} from '../ble/types';

const TEST_HEIGHT = 844;

const medium = (distance: number): Threat => ({speed: 12, distance, level: ThreatLevel.Medium});
const high = (distance: number): Threat => ({speed: 22, distance, level: ThreatLevel.High});

describe('RadarStrip', () => {
  it('renders without crashing', () => {
    const {getByTestId} = render(<RadarStrip threats={[]} position="left" height={TEST_HEIGHT} />);
    expect(getByTestId('radar-strip')).toBeTruthy();
  });

  it('renders green strip with no icons when no threats', () => {
    const {getByTestId, queryByTestId} = render(<RadarStrip threats={[]} position="left" height={TEST_HEIGHT} />);
    const strip = getByTestId('radar-strip');
    expect(strip.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({backgroundColor: '#22C55E'})]),
    );
    expect(queryByTestId('car-icon-0')).toBeNull();
  });

  it('renders orange background for medium speed threat', () => {
    const {getByTestId} = render(<RadarStrip threats={[medium(80)]} position="left" height={TEST_HEIGHT} />);
    const strip = getByTestId('radar-strip');
    expect(strip.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({backgroundColor: '#F97316'})]),
    );
  });

  it('renders red background for high speed threat', () => {
    const {getByTestId} = render(<RadarStrip threats={[high(40)]} position="left" height={TEST_HEIGHT} />);
    const strip = getByTestId('radar-strip');
    expect(strip.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({backgroundColor: '#EF4444'})]),
    );
  });

  it('renders red when mixed medium and high threats', () => {
    const {getByTestId} = render(
      <RadarStrip threats={[medium(80), high(40)]} position="left" height={TEST_HEIGHT} />,
    );
    const strip = getByTestId('radar-strip');
    expect(strip.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({backgroundColor: '#EF4444'})]),
    );
  });

  it('renders one car icon per threat', () => {
    const {getByTestId} = render(
      <RadarStrip threats={[medium(80), high(40), medium(150)]} position="left" height={TEST_HEIGHT} />,
    );
    expect(getByTestId('car-icon-0')).toBeTruthy();
    expect(getByTestId('car-icon-1')).toBeTruthy();
    expect(getByTestId('car-icon-2')).toBeTruthy();
  });

  it('positions closer threats higher (smaller top value)', () => {
    const {getByTestId} = render(
      <RadarStrip threats={[medium(150), high(30)]} position="left" height={TEST_HEIGHT} />,
    );
    const icon0 = getByTestId('car-icon-0'); // closest (30m) — sorted first
    const icon1 = getByTestId('car-icon-1'); // further (150m)
    // top value is stored as accessibilityHint for test introspection
    const top0 = parseFloat(icon0.props.accessibilityHint);
    const top1 = parseFloat(icon1.props.accessibilityHint);
    expect(top0).toBeLessThan(top1); // closer = smaller top (higher on screen)
  });

  it('positions right sidebar on right side', () => {
    const {getByTestId} = render(<RadarStrip threats={[]} position="right" height={TEST_HEIGHT} />);
    const strip = getByTestId('radar-strip');
    // Style is an array — check the dynamic position entry directly
    const styleArray: object[] = Array.isArray(strip.props.style) ? strip.props.style : [strip.props.style];
    const hasRight = styleArray.some(s => s && typeof s === 'object' && 'right' in s && (s as any).right === 0);
    expect(hasRight).toBe(true);
  });
});


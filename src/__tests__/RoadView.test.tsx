import React from 'react';
import {render} from '@testing-library/react-native';
import {RoadView} from '../ui/components/RoadView';
import {ThreatLevel, Threat} from '../ble/types';

const TEST_HEIGHT = 700;

const medium = (distance: number): Threat => ({speed: 12, distance, level: ThreatLevel.Medium});
const high = (distance: number): Threat => ({speed: 22, distance, level: ThreatLevel.High});

describe('RoadView', () => {
  it('renders road surface', () => {
    const {getByTestId} = render(<RoadView threats={[]} height={TEST_HEIGHT} />);
    expect(getByTestId('road-view')).toBeTruthy();
  });

  it('renders no car icons when no threats', () => {
    const {queryByTestId} = render(<RoadView threats={[]} height={TEST_HEIGHT} />);
    expect(queryByTestId('road-car-0')).toBeNull();
  });

  it('renders one car icon per threat', () => {
    const {getByTestId} = render(
      <RoadView threats={[medium(80), high(40), medium(150)]} height={TEST_HEIGHT} />,
    );
    expect(getByTestId('road-car-0')).toBeTruthy();
    expect(getByTestId('road-car-1')).toBeTruthy();
    expect(getByTestId('road-car-2')).toBeTruthy();
  });

  it('renders closer threat with larger top value (lower on road = near rider)', () => {
    const {getByTestId} = render(
      <RoadView threats={[medium(30), medium(150)]} height={TEST_HEIGHT} />,
    );
    // Sorted ascending by distance: 30m first (index 0), 150m second (index 1)
    const close = getByTestId('road-car-0'); // 30m — closer
    const far = getByTestId('road-car-1');   // 150m — further away
    // topY is exposed via accessibilityHint for test introspection
    const farTop = parseFloat(far.props.accessibilityHint);
    const closeTop = parseFloat(close.props.accessibilityHint);
    // Rider is at TOP — close cars are nearer to rider = smaller top value (higher on screen)
    expect(closeTop).toBeLessThan(farTop);
  });
});

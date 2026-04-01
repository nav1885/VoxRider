import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {MainScreen} from '../ui/screens/MainScreen';

const insetMetrics = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 47, left: 0, right: 0, bottom: 34},
};

function Wrapper({children}: {children: React.ReactNode}) {
  return <SafeAreaProvider initialMetrics={insetMetrics}>{children}</SafeAreaProvider>;
}
import {useRadarStore} from '../ble/radarStore';
import {useSettingsStore} from '../settings/settingsStore';
import {ConnectionStatus, ThreatLevel} from '../ble/types';
import {AlertVerbosity} from '../alerts/types';

// Reset Zustand stores between tests
beforeEach(() => {
  useRadarStore.setState({
    threats: [],
    connectionStatus: ConnectionStatus.Disconnected,
    connectedDevice: null,
    batteryLevel: null,
    consecutiveFailures: 0,
  });
  useSettingsStore.setState({
    sidebarPosition: 'left',
    verbosity: AlertVerbosity.Detailed,
    units: 'imperial',
    pairedDevices: [],
  });
});

describe('MainScreen', () => {
  describe('connection status', () => {
    it('shows "Searching..." when scanning', () => {
      useRadarStore.setState({connectionStatus: ConnectionStatus.Scanning});
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(getByTestId('connection-status').props.children).toBe('Searching...');
    });

    it('shows device name when connected', () => {
      useRadarStore.setState({
        connectionStatus: ConnectionStatus.Connected,
        connectedDevice: {id: 'abc', name: 'RTL64894', rssi: -60},
      });
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(getByTestId('connection-status').props.children).toBe('Connected · RTL64894');
    });
  });

  describe('threat state', () => {
    it('shows "Clear" when no threats', () => {
      useRadarStore.setState({connectionStatus: ConnectionStatus.Connected, threats: []});
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(getByTestId('threat-label').props.children).toBe('Clear');
    });

    it('shows vehicle count and closest distance (imperial)', () => {
      useRadarStore.setState({
        connectionStatus: ConnectionStatus.Connected,
        threats: [
          {speed: 12, distance: 40, level: ThreatLevel.Medium},
          {speed: 15, distance: 80, level: ThreatLevel.Medium},
        ],
      });
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      // 40m → ~131ft
      expect(getByTestId('threat-label').props.children).toBe('2 vehicles · 131ft');
    });

    it('shows vehicle count and distance in metric', () => {
      useSettingsStore.setState({
        sidebarPosition: 'left',
        verbosity: AlertVerbosity.Detailed,
        units: 'metric',
        pairedDevices: [],
      });
      useRadarStore.setState({
        connectionStatus: ConnectionStatus.Connected,
        threats: [{speed: 12, distance: 80, level: ThreatLevel.Medium}],
      });
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(getByTestId('threat-label').props.children).toBe('1 vehicle · 80m');
    });
  });

  describe('battery', () => {
    it('hides battery bar when batteryLevel is null', () => {
      const {queryByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(queryByTestId('battery-row')).toBeNull();
    });

    it('shows battery bar when level is available', () => {
      useRadarStore.setState({batteryLevel: 75});
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(getByTestId('battery-row')).toBeTruthy();
    });

    it('renders battery bar red at 10%', () => {
      useRadarStore.setState({batteryLevel: 10});
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      const bar = getByTestId('battery-bar');
      expect(bar.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({backgroundColor: '#EF4444'})]),
      );
    });

    it('renders battery bar default color at 11%', () => {
      useRadarStore.setState({batteryLevel: 11});
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      const bar = getByTestId('battery-bar');
      expect(bar.props.style).not.toEqual(
        expect.arrayContaining([expect.objectContaining({backgroundColor: '#EF4444'})]),
      );
    });
  });

  describe('conflict hint', () => {
    it('hides conflict hint below 3 failures', () => {
      useRadarStore.setState({consecutiveFailures: 2});
      const {queryByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(queryByTestId('conflict-hint')).toBeNull();
    });

    it('shows conflict hint at 3+ failures', () => {
      useRadarStore.setState({consecutiveFailures: 3});
      const {getByTestId} = render(<MainScreen  />, {wrapper: Wrapper});
      expect(getByTestId('conflict-hint')).toBeTruthy();
    });
  });

});

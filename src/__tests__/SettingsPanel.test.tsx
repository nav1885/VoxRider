import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {SettingsPanel} from '../ui/screens/SettingsPanel';
import {useSettingsStore} from '../settings/settingsStore';
import {AlertVerbosity} from '../alerts/types';

const insetMetrics = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 47, left: 0, right: 0, bottom: 34},
};
function Wrapper({children}: {children: React.ReactNode}) {
  return <SafeAreaProvider initialMetrics={insetMetrics}>{children}</SafeAreaProvider>;
}

beforeEach(() => {
  useSettingsStore.setState({
    sidebarPosition: 'left',
    verbosity: AlertVerbosity.Detailed,
    units: 'imperial',
    pairedDevices: [],
  });
});

describe('SettingsPanel', () => {
  const noop = jest.fn();

  describe('sidebar position', () => {
    it('renders with left selected by default', () => {
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={noop} />, {wrapper: Wrapper});
      expect(getByTestId('sidebar-left').props.accessibilityState?.selected).toBe(true);
      expect(getByTestId('sidebar-right').props.accessibilityState?.selected).toBe(false);
    });

    it('switches to right when tapped', () => {
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={noop} />, {wrapper: Wrapper});
      fireEvent.press(getByTestId('sidebar-right'));
      expect(useSettingsStore.getState().sidebarPosition).toBe('right');
    });
  });

  describe('verbosity', () => {
    it('renders Detailed as default selected', () => {
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={noop} />, {wrapper: Wrapper});
      expect(getByTestId('verbosity-detailed').props.accessibilityState?.selected).toBe(true);
      expect(getByTestId('verbosity-balanced').props.accessibilityState?.selected).toBe(false);
      expect(getByTestId('verbosity-minimal').props.accessibilityState?.selected).toBe(false);
    });

    it('switches verbosity on tap', () => {
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={noop} />, {wrapper: Wrapper});
      fireEvent.press(getByTestId('verbosity-minimal'));
      expect(useSettingsStore.getState().verbosity).toBe(AlertVerbosity.Minimal);
    });
  });

  describe('units', () => {
    it('switches to metric', () => {
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={noop} />, {wrapper: Wrapper});
      fireEvent.press(getByTestId('units-metric'));
      expect(useSettingsStore.getState().units).toBe('metric');
    });
  });

  describe('paired devices', () => {
    it('shows "No devices paired" when empty', () => {
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={noop} />, {wrapper: Wrapper});
      expect(getByTestId('no-devices-text')).toBeTruthy();
    });

    it('shows device rows when devices are paired', () => {
      useSettingsStore.setState({
        sidebarPosition: 'left',
        verbosity: AlertVerbosity.Detailed,
        units: 'imperial',
        pairedDevices: [{id: 'abc123', name: 'RTL64894', rssi: -60}],
      });
      const {getByTestId, queryByTestId} = render(
        <SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={noop} />,
        {wrapper: Wrapper},
      );
      expect(getByTestId('device-row-abc123')).toBeTruthy();
      expect(queryByTestId('no-devices-text')).toBeNull();
    });

    it('calls onRemoveDevice when Remove tapped', () => {
      useSettingsStore.setState({
        sidebarPosition: 'left',
        verbosity: AlertVerbosity.Detailed,
        units: 'imperial',
        pairedDevices: [{id: 'abc123', name: 'RTL64894', rssi: -60}],
      });
      const onRemoveDevice = jest.fn();
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={noop} onRemoveDevice={onRemoveDevice} />, {wrapper: Wrapper});
      fireEvent.press(getByTestId('remove-device-abc123'));
      expect(onRemoveDevice).toHaveBeenCalledWith('abc123');
    });

    it('calls onAddDevice when Add Device tapped', () => {
      const onAddDevice = jest.fn();
      const {getByTestId} = render(<SettingsPanel onClose={noop} onAddDevice={onAddDevice} onRemoveDevice={noop} />, {wrapper: Wrapper});
      fireEvent.press(getByTestId('add-device-button'));
      expect(onAddDevice).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('calls onClose when ✕ tapped', () => {
      const onClose = jest.fn();
      const {getByTestId} = render(<SettingsPanel onClose={onClose} onAddDevice={noop} />, {wrapper: Wrapper});
      fireEvent.press(getByTestId('settings-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

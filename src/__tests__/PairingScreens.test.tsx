import React from 'react';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PairingStep1} from '../ui/screens/PairingStep1';
import {PairingStep2} from '../ui/screens/PairingStep2';
import {MockBLEManager} from '../ble/MockBLEManager';
import {DeviceInfo} from '../ble/types';

const insetMetrics = {
  frame: {x: 0, y: 0, width: 390, height: 844},
  insets: {top: 47, left: 0, right: 0, bottom: 34},
};
function Wrapper({children}: {children: React.ReactNode}) {
  return <SafeAreaProvider initialMetrics={insetMetrics}>{children}</SafeAreaProvider>;
}

const device1: DeviceInfo = {id: 'RTL64894', name: 'RTL64894', rssi: -55};
const device2: DeviceInfo = {id: 'RTL11111', name: 'RTL11111', rssi: -75};

describe('PairingStep1', () => {
  it('renders illustration, label, and progress', () => {
    const {getByTestId} = render(<PairingStep1 onSearch={jest.fn()} />, {wrapper: Wrapper});
    expect(getByTestId('varia-illustration')).toBeTruthy();
    expect(getByTestId('search-button')).toBeTruthy();
    expect(getByTestId('step-progress').props.children).toBe('Step 1 of 2');
  });

  it('calls onSearch when Search button tapped', () => {
    const onSearch = jest.fn();
    const {getByTestId} = render(<PairingStep1 onSearch={onSearch} />, {wrapper: Wrapper});
    fireEvent.press(getByTestId('search-button'));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('renders Varia illustration', () => {
    const {getByTestId} = render(<PairingStep1 onSearch={jest.fn()} />, {wrapper: Wrapper});
    expect(getByTestId('varia-illustration')).toBeTruthy();
  });
});

describe('PairingStep2', () => {
  let ble: MockBLEManager;

  beforeEach(() => {
    jest.useFakeTimers();
    ble = new MockBLEManager();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows scanning indicator on mount', () => {
    ble.setScanDevices([]);
    const {getByTestId} = render(
      <PairingStep2 bleManager={ble} onConnected={jest.fn()} />,
      {wrapper: Wrapper},
    );
    expect(getByTestId('scanning-indicator')).toBeTruthy();
    expect(getByTestId('step-progress').props.children).toBe('Step 2 of 2');
  });

  it('shows one device after scan resolves', async () => {
    ble.setScanDevices([device1]);
    const {getByTestId} = render(
      <PairingStep2 bleManager={ble} onConnected={jest.fn()} />,
      {wrapper: Wrapper},
    );
    await waitFor(() => getByTestId(`device-item-${device1.id}`));
    expect(getByTestId(`device-item-${device1.id}`)).toBeTruthy();
  });

  it('lists two devices sorted by RSSI (strongest first)', async () => {
    // device1 RSSI=-55 (stronger), device2 RSSI=-75
    ble.setScanDevices([device2, device1]); // intentionally reversed
    const {getAllByTestId} = render(
      <PairingStep2 bleManager={ble} onConnected={jest.fn()} />,
      {wrapper: Wrapper},
    );
    await waitFor(() => getAllByTestId(/^device-item-/));
    const items = getAllByTestId(/^device-item-/);
    expect(items[0].props.testID).toBe(`device-item-${device1.id}`); // stronger first
    expect(items[1].props.testID).toBe(`device-item-${device2.id}`);
  });

  it('calls onConnected after successful connect', async () => {
    ble.setScanDevices([device1]);
    const onConnected = jest.fn();
    const {getByTestId} = render(
      <PairingStep2 bleManager={ble} onConnected={onConnected} />,
      {wrapper: Wrapper},
    );
    await waitFor(() => getByTestId(`device-item-${device1.id}`));
    fireEvent.press(getByTestId(`device-item-${device1.id}`));
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(device1));
  });

  it('shows connect error and allows retry on failure', async () => {
    ble.setScanDevices([device1]);
    ble.setConnectShouldFail(true);
    const {getByTestId} = render(
      <PairingStep2 bleManager={ble} onConnected={jest.fn()} />,
      {wrapper: Wrapper},
    );
    await waitFor(() => getByTestId(`device-item-${device1.id}`));
    fireEvent.press(getByTestId(`device-item-${device1.id}`));
    await waitFor(() => getByTestId('connect-error'));
    expect(getByTestId('connect-error')).toBeTruthy();
    // Device still in list for retry
    expect(getByTestId(`device-item-${device1.id}`)).toBeTruthy();
  });

  it('shows timeout message after 30s with no devices', async () => {
    ble.setScanDevices([]);
    const {getByTestId} = render(
      <PairingStep2 bleManager={ble} onConnected={jest.fn()} />,
      {wrapper: Wrapper},
    );
    act(() => jest.advanceTimersByTime(30001));
    await waitFor(() => getByTestId('timeout-message'));
    expect(getByTestId('timeout-message')).toBeTruthy();
  });

  it('restarts scan on Try Again tap', async () => {
    ble.setScanDevices([]);
    const {getByTestId} = render(
      <PairingStep2 bleManager={ble} onConnected={jest.fn()} />,
      {wrapper: Wrapper},
    );
    act(() => jest.advanceTimersByTime(30001));
    await waitFor(() => getByTestId('try-again-button'));

    // Now have a device for the rescan
    ble.setScanDevices([device1]);
    fireEvent.press(getByTestId('try-again-button'));
    await waitFor(() => getByTestId(`device-item-${device1.id}`));
    expect(getByTestId(`device-item-${device1.id}`)).toBeTruthy();
  });
});

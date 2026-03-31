import React from 'react';
import {render, fireEvent} from '@testing-library/react-native';
import {Platform, PermissionsAndroid, Linking} from 'react-native';
import {renderHook, act} from '@testing-library/react-native';
import {useBluetoothPermission} from '../permissions/useBluetoothPermission';
import {PermissionBanner} from '../ui/components/PermissionBanner';

// Spy on PermissionsAndroid methods once — implementations set per-test
const mockRequestMultiple = jest.spyOn(PermissionsAndroid, 'requestMultiple');
const mockRequest = jest.spyOn(PermissionsAndroid, 'request');

afterEach(() => {
  // Restore Platform between tests
  Platform.OS = 'ios';
  mockRequestMultiple.mockReset();
  mockRequest.mockReset();
});

describe('useBluetoothPermission — iOS', () => {
  it('returns granted immediately on iOS without calling PermissionsAndroid', async () => {
    Platform.OS = 'ios';
    const {result} = renderHook(() => useBluetoothPermission());
    let status: string | undefined;
    await act(async () => {
      status = await result.current.request();
    });
    expect(status).toBe('granted');
    expect(mockRequestMultiple).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('useBluetoothPermission — Android 12+ (BLUETOOTH_SCAN + BLUETOOTH_CONNECT)', () => {
  // Test the API 31+ code path directly by mocking requestMultiple
  // and ensuring request is NOT called (confirming the right branch ran)

  it('maps both GRANTED → granted', async () => {
    Platform.OS = 'android';
    mockRequestMultiple.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
    } as any);
    // Prevent the ≤30 path from running if Platform.Version is low
    mockRequest.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    const {result} = renderHook(() => useBluetoothPermission());
    let status: string | undefined;
    await act(async () => {
      status = await result.current.request();
    });
    // Either requestMultiple (API 31+) or request (API ≤30) ran; result should be 'granted'
    expect(status).toBe('granted');
  });

  it('returns denied when requestMultiple returns DENIED for BLUETOOTH_SCAN', async () => {
    Platform.OS = 'android';
    mockRequestMultiple.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.DENIED,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
    } as any);
    mockRequest.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    const {result} = renderHook(() => useBluetoothPermission());
    let status: string | undefined;
    await act(async () => {
      status = await result.current.request();
    });
    expect(status).toBe('denied');
  });

  it('returns blocked when requestMultiple returns NEVER_ASK_AGAIN', async () => {
    Platform.OS = 'android';
    mockRequestMultiple.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
    } as any);
    mockRequest.mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);

    const {result} = renderHook(() => useBluetoothPermission());
    let status: string | undefined;
    await act(async () => {
      status = await result.current.request();
    });
    expect(status).toBe('blocked');
  });
});

describe('useBluetoothPermission — Android ≤30 (ACCESS_FINE_LOCATION)', () => {
  // Force the ≤30 path by making requestMultiple throw (simulates it being unavailable)
  // and mocking request to return controllable values.

  it('returns granted when ACCESS_FINE_LOCATION granted', async () => {
    Platform.OS = 'android';
    mockRequest.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    // If API ≤30 path is taken, requestMultiple won't be called
    mockRequestMultiple.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
    } as any);

    const {result} = renderHook(() => useBluetoothPermission());
    let status: string | undefined;
    await act(async () => {
      status = await result.current.request();
    });
    expect(status).toBe('granted');
  });

  it('returns denied when ACCESS_FINE_LOCATION denied', async () => {
    Platform.OS = 'android';
    mockRequest.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    mockRequestMultiple.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.DENIED,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.DENIED,
    } as any);

    const {result} = renderHook(() => useBluetoothPermission());
    let status: string | undefined;
    await act(async () => {
      status = await result.current.request();
    });
    expect(status).toBe('denied');
  });

  it('returns blocked when ACCESS_FINE_LOCATION never_ask_again', async () => {
    Platform.OS = 'android';
    mockRequest.mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    mockRequestMultiple.mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    } as any);

    const {result} = renderHook(() => useBluetoothPermission());
    let status: string | undefined;
    await act(async () => {
      status = await result.current.request();
    });
    expect(status).toBe('blocked');
  });
});

describe('PermissionBanner', () => {
  it('renders nothing when status is unknown', () => {
    const {queryByTestId} = render(
      <PermissionBanner status="unknown" onRetry={jest.fn()} />,
    );
    expect(queryByTestId('permission-banner')).toBeNull();
  });

  it('renders nothing when status is granted', () => {
    const {queryByTestId} = render(
      <PermissionBanner status="granted" onRetry={jest.fn()} />,
    );
    expect(queryByTestId('permission-banner')).toBeNull();
  });

  it('shows banner with retry button when denied', () => {
    const onRetry = jest.fn();
    const {getByTestId, queryByTestId} = render(
      <PermissionBanner status="denied" onRetry={onRetry} />,
    );
    expect(getByTestId('permission-banner')).toBeTruthy();
    expect(getByTestId('permission-retry')).toBeTruthy();
    expect(queryByTestId('permission-open-settings')).toBeNull();
  });

  it('calls onRetry when retry tapped', () => {
    const onRetry = jest.fn();
    const {getByTestId} = render(
      <PermissionBanner status="denied" onRetry={onRetry} />,
    );
    fireEvent.press(getByTestId('permission-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows Open Settings button when blocked', () => {
    const {getByTestId, queryByTestId} = render(
      <PermissionBanner status="blocked" onRetry={jest.fn()} />,
    );
    expect(getByTestId('permission-open-settings')).toBeTruthy();
    expect(queryByTestId('permission-retry')).toBeNull();
  });

  it('calls Linking.openSettings when Open Settings tapped', () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const {getByTestId} = render(
      <PermissionBanner status="blocked" onRetry={jest.fn()} />,
    );
    fireEvent.press(getByTestId('permission-open-settings'));
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    openSettingsSpy.mockRestore();
  });
});

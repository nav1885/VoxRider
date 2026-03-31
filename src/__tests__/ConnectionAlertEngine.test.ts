import {ConnectionAlertEngine} from '../alerts/ConnectionAlertEngine';
import {ConnectionStatus} from '../ble/types';
import {Strings} from '../constants/strings';

describe('ConnectionAlertEngine', () => {
  let speak: jest.Mock;
  let engine: ConnectionAlertEngine;

  beforeEach(() => {
    jest.useFakeTimers();
    speak = jest.fn();
    engine = new ConnectionAlertEngine(speak);
  });

  afterEach(() => {
    engine.destroy();
    jest.useRealTimers();
  });

  it('announces "Radar disconnected" when dropping from connected', () => {
    engine.onFirstConnect();
    engine.onStatusChange(ConnectionStatus.Disconnected);
    expect(speak).toHaveBeenCalledWith(Strings.ttsRadarDisconnected);
  });

  it('announces "Radar reconnected" when recovering from disconnected', () => {
    engine.onFirstConnect();
    engine.onStatusChange(ConnectionStatus.Disconnected);
    speak.mockClear();
    engine.onStatusChange(ConnectionStatus.Connected);
    expect(speak).toHaveBeenCalledWith(Strings.ttsRadarReconnected);
  });

  it('announces "Radar reconnected" when recovering from reconnecting', () => {
    engine.onFirstConnect();
    engine.onStatusChange(ConnectionStatus.Reconnecting);
    speak.mockClear();
    engine.onStatusChange(ConnectionStatus.Connected);
    expect(speak).toHaveBeenCalledWith(Strings.ttsRadarReconnected);
  });

  it('does not announce reconnected on first connect (scanning → connected)', () => {
    engine.onStatusChange(ConnectionStatus.Scanning);
    engine.onStatusChange(ConnectionStatus.Connected);
    expect(speak).not.toHaveBeenCalledWith(Strings.ttsRadarReconnected);
  });

  it('does not fire any announcement for same-status repeated calls', () => {
    engine.onFirstConnect();
    engine.onStatusChange(ConnectionStatus.Connected);
    expect(speak).not.toHaveBeenCalled();
  });

  describe('No radar signal backoff', () => {
    it('fires first "No radar signal" at T+30s', () => {
      engine.onFirstConnect();
      engine.onStatusChange(ConnectionStatus.Disconnected);
      speak.mockClear();

      jest.advanceTimersByTime(30000);
      expect(speak).toHaveBeenCalledWith(Strings.ttsNoRadarSignal);
      expect(speak).toHaveBeenCalledTimes(1);
    });

    it('fires second at T+90s (+60s)', () => {
      engine.onFirstConnect();
      engine.onStatusChange(ConnectionStatus.Disconnected);
      speak.mockClear();

      jest.advanceTimersByTime(90000);
      expect(speak).toHaveBeenCalledWith(Strings.ttsNoRadarSignal);
      expect(speak).toHaveBeenCalledTimes(2);
    });

    it('fires third at T+390s (+300s)', () => {
      engine.onFirstConnect();
      engine.onStatusChange(ConnectionStatus.Disconnected);
      speak.mockClear();

      jest.advanceTimersByTime(390000);
      expect(speak).toHaveBeenCalledTimes(3);
    });

    it('fires fifth and stops after T+1890s', () => {
      engine.onFirstConnect();
      engine.onStatusChange(ConnectionStatus.Disconnected);
      speak.mockClear();

      jest.advanceTimersByTime(1890000);
      expect(speak).toHaveBeenCalledTimes(5);

      // Nothing after 5
      jest.advanceTimersByTime(9999000);
      expect(speak).toHaveBeenCalledTimes(5);
    });

    it('cancels backoff on reconnect', () => {
      engine.onFirstConnect();
      engine.onStatusChange(ConnectionStatus.Disconnected);
      speak.mockClear();

      jest.advanceTimersByTime(15000); // halfway to first
      engine.onStatusChange(ConnectionStatus.Connected);
      speak.mockClear(); // clear the "Radar reconnected" call

      jest.advanceTimersByTime(30000); // past where first would fire
      expect(speak).not.toHaveBeenCalledWith(Strings.ttsNoRadarSignal);
    });

    it('does not fire if reconnected before 30s', () => {
      engine.onFirstConnect();
      engine.onStatusChange(ConnectionStatus.Disconnected);
      speak.mockClear();

      jest.advanceTimersByTime(20000);
      engine.onStatusChange(ConnectionStatus.Connected);
      speak.mockClear();

      jest.advanceTimersByTime(20000);
      expect(speak).not.toHaveBeenCalled();
    });

    it('resets backoff on second disconnect after reconnect', () => {
      engine.onFirstConnect();
      engine.onStatusChange(ConnectionStatus.Disconnected);
      jest.advanceTimersByTime(90000); // fires 2 announcements
      engine.onStatusChange(ConnectionStatus.Connected);
      engine.onStatusChange(ConnectionStatus.Disconnected);
      speak.mockClear();

      // New backoff — first fires at T+30s from the new disconnect
      jest.advanceTimersByTime(30000);
      expect(speak).toHaveBeenCalledWith(Strings.ttsNoRadarSignal);
      expect(speak).toHaveBeenCalledTimes(1);
    });
  });
});

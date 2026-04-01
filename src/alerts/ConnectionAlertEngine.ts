import {ConnectionStatus} from '../ble/types';
import {Strings} from '../constants/strings';

/**
 * ConnectionAlertEngine — fires TTS announcements for BLE connection state changes.
 *
 * Responsibilities:
 *  - "Radar disconnected" on drop
 *  - "Radar reconnected" on recovery
 *  - "No radar signal" on exponential backoff if disconnected > 30s:
 *      T+30s, T+90s, T+390s, T+990s, T+1890s → silent thereafter
 *  - All timers cancel on reconnect
 *
 * Speak callback accepts (message: string) — caller wires to TTSEngine or native TTS.
 */

const BACKOFF_INTERVALS_MS = [30000, 60000, 300000, 600000, 900000];
// Cumulative: 30s, 90s, 390s, 990s, 1890s

export class ConnectionAlertEngine {
  private speak: (message: string) => void;
  private prevStatus: ConnectionStatus | null = null;
  private hadConnection = false;
  private wasDisconnected = false;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffStep = 0;

  constructor(speak: (message: string) => void) {
    this.speak = speak;
  }

  /**
   * Call this whenever ConnectionStatus changes (or on each BLE state update).
   * Only reacts when status actually changes.
   */
  onStatusChange(next: ConnectionStatus): void {
    const prev = this.prevStatus;
    this.prevStatus = next;

    if (next === prev) {
      return;
    }

    if (next === ConnectionStatus.Connected) {
      this._cancelBackoff();
      if (this.wasDisconnected) {
        this.speak(Strings.ttsRadarReconnected);
        this.wasDisconnected = false;
      }
      this.hadConnection = true;
    } else if (next === ConnectionStatus.Disconnected || next === ConnectionStatus.Reconnecting) {
      if (this.hadConnection && prev === ConnectionStatus.Connected) {
        this.speak(Strings.ttsRadarDisconnected);
        this.wasDisconnected = true;
        this._startBackoff();
      }
    }
  }

  /**
   * Call this on first successful connection (pairing or auto-connect).
   * Does NOT fire "Radar reconnected" — only used for the very first connect.
   */
  onFirstConnect(): void {
    this._cancelBackoff();
    this.prevStatus = ConnectionStatus.Connected;
    this.hadConnection = true;
    this.wasDisconnected = false;
  }

  destroy(): void {
    this._cancelBackoff();
  }

  private _startBackoff(): void {
    this._cancelBackoff();
    this.backoffStep = 0;
    this._scheduleNextBackoff();
  }

  private _scheduleNextBackoff(): void {
    if (this.backoffStep >= BACKOFF_INTERVALS_MS.length) {
      return; // Silent after fifth announcement
    }
    const delay = BACKOFF_INTERVALS_MS[this.backoffStep];
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      // Only fire if still disconnected
      const status = this.prevStatus;
      if (status === ConnectionStatus.Disconnected || status === ConnectionStatus.Reconnecting) {
        this.speak(Strings.ttsNoRadarSignal);
        this.backoffStep += 1;
        this._scheduleNextBackoff();
      }
    }, delay);
  }

  private _cancelBackoff(): void {
    if (this.backoffTimer !== null) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
    this.backoffStep = 0;
  }
}

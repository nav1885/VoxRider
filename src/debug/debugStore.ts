import {create} from 'zustand';
import {Threat, ThreatLevel} from '../ble/types';

const MAX_LOG_LINES = 40;
const MAX_PACKET_ENTRIES = 60; // 1 min of data at 1 Hz

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:mm:ss.mmm
}

function append(log: string, line: string, max = MAX_LOG_LINES): string {
  const lines = log ? log.split('\n') : [];
  lines.unshift(`${ts()}  ${line}`);
  if (lines.length > max) {
    lines.splice(max);
  }
  return lines.join('\n');
}

const LEVEL_CHAR: Record<ThreatLevel, string> = {
  [ThreatLevel.None]:    '-',
  [ThreatLevel.Medium]:  'M',
  [ThreatLevel.High]:    'H',
  [ThreatLevel.Unknown]: '?',
};

/**
 * Compact single-line representation of one BLE notification's raw bytes.
 * Logged before parsing so parser bugs don't affect the ground truth.
 * Format: "hex=01 19 5A 80  parsed=1  {s=25,d=90,H}"
 * When reassembly is pending (parseRadarPacket returns null): "hex=... parsed=pending"
 */
function formatRawPacket(bytes: Uint8Array, threats: Threat[] | null): string {
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

  if (threats === null) {
    return `hex=${hex}  parsed=pending`;
  }
  if (threats.length === 0) {
    return `hex=${hex}  parsed=0`;
  }
  const slots = threats
    .map(t => `{s=${t.speed},d=${t.distance},${LEVEL_CHAR[t.level]}}`)
    .join(' ');
  return `hex=${hex}  parsed=${threats.length}  ${slots}`;
}

interface DebugState {
  /** Algorithm decisions — what AlertEngine intended to do */
  alertLog: string;
  /** TTS execution — what TTSEngine + native TTS actually did */
  ttsLog: string;
  /** Last message spoken (shown as single line) */
  lastAnnouncement: string;
  /**
   * Raw BLE packet log — one line per notification from the Varia.
   * Includes both the raw hex bytes AND the parsed threats, so parser bugs
   * are visible. "parsed=pending" means a split packet is being reassembled.
   * Circular buffer, MAX_PACKET_ENTRIES lines (~1 min at 1 Hz).
   */
  packetLog: string;

  appendAlertLog:  (line: string) => void;
  appendTTSLog:    (line: string) => void;
  /**
   * Log one BLE notification.
   * @param bytes  Raw bytes from the characteristic notification.
   * @param threats Parsed threats, or null if reassembly is still pending.
   */
  appendPacketLog: (bytes: Uint8Array, threats: Threat[] | null) => void;
  setLastAnnouncement: (text: string) => void;
  clearLogs: () => void;
}

export const useDebugStore = create<DebugState>(set => ({
  alertLog: '',
  ttsLog: '',
  lastAnnouncement: '',
  packetLog: '',

  appendAlertLog:  line => set(s => ({alertLog:  append(s.alertLog,  line)})),
  appendTTSLog:    line => set(s => ({ttsLog:    append(s.ttsLog,    line)})),
  appendPacketLog: (bytes, threats) =>
    set(s => ({packetLog: append(s.packetLog, formatRawPacket(bytes, threats), MAX_PACKET_ENTRIES)})),
  setLastAnnouncement: text => set({lastAnnouncement: text}),
  clearLogs: () => set({alertLog: '', ttsLog: '', lastAnnouncement: '', packetLog: ''}),
}));

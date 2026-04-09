import {create} from 'zustand';

const MAX_LINES = 40;

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:mm:ss.mmm
}

function append(log: string, line: string): string {
  const lines = log ? log.split('\n') : [];
  lines.push(`${ts()}  ${line}`);
  if (lines.length > MAX_LINES) {
    lines.splice(0, lines.length - MAX_LINES);
  }
  return lines.join('\n');
}

interface DebugState {
  /** Algorithm decisions — what AlertEngine intended to do */
  alertLog: string;
  /** TTS execution — what TTSEngine + native TTS actually did */
  ttsLog: string;
  /** Last message spoken (shown as single line) */
  lastAnnouncement: string;

  appendAlertLog: (line: string) => void;
  appendTTSLog: (line: string) => void;
  setLastAnnouncement: (text: string) => void;
  clearLogs: () => void;
}

export const useDebugStore = create<DebugState>(set => ({
  alertLog: '',
  ttsLog: '',
  lastAnnouncement: '',

  appendAlertLog: line => set(s => ({alertLog: append(s.alertLog, line)})),
  appendTTSLog:   line => set(s => ({ttsLog:   append(s.ttsLog,   line)})),
  setLastAnnouncement: text => set({lastAnnouncement: text}),
  clearLogs: () => set({alertLog: '', ttsLog: '', lastAnnouncement: ''}),
}));

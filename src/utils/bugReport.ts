import {Platform, Linking} from 'react-native';
import {APP_VERSION} from '../constants/version';
import {useRadarStore} from '../ble/radarStore';
import {useDebugStore} from '../debug/debugStore';

const GITHUB_REPO = 'nav1885/VoxRider';

// GitHub issue body URL limit — stay well under 8192 chars after encoding
const MAX_LOG_CHARS = 1500;

function getDeviceModel(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = Platform.constants as any;
  if (Platform.OS === 'android') {
    const brand: string = c.Brand ?? '';
    const model: string = c.Model ?? '';
    const release: string = c.Release ?? String(Platform.Version);
    return `${brand} ${model} (Android ${release})`.trim();
  }
  const systemName: string = c.systemName ?? 'iOS';
  const systemVersion: string = c.osVersion ?? String(Platform.Version);
  const model: string = c.Model ?? '';
  return `${model} (${systemName} ${systemVersion})`.trim();
}

/** Trim a multi-line log to its last N characters, preserving whole lines. */
function trimLog(log: string, maxChars: number): string {
  if (!log) {
    return '  (none)';
  }
  const trimmed = log.length > maxChars ? log.slice(log.length - maxChars) : log;
  // Drop a potentially partial first line after slicing
  const firstNewline = trimmed.indexOf('\n');
  const clean = firstNewline > 0 ? trimmed.slice(firstNewline + 1) : trimmed;
  return clean
    .split('\n')
    .filter(Boolean)
    .map(l => `  ${l}`)
    .join('\n');
}

export async function openBugReport(): Promise<void> {
  const {connectionStatus, threats} = useRadarStore.getState();
  const {ttsLog, alertLog, packetLog, lastAnnouncement} = useDebugStore.getState();

  const body = [
    '**Describe the bug**',
    '<!-- What happened? What did you expect? -->',
    '',
    '---',
    '',
    '**Diagnostics (auto-collected)**',
    `- App version: ${APP_VERSION}`,
    `- Platform: ${getDeviceModel()}`,
    `- Timestamp: ${new Date().toISOString()}`,
    `- Connection status: ${connectionStatus}`,
    `- Active threats: ${threats.length}`,
    `- Last announcement: ${lastAnnouncement || '(none)'}`,
    '',
    '**Packet log** (raw BLE threats per tick — `N  {s=speed,d=dist,Level}`):',
    '```',
    trimLog(packetLog, MAX_LOG_CHARS),
    '```',
    '',
    '**Alert engine log:**',
    '```',
    trimLog(alertLog, MAX_LOG_CHARS),
    '```',
    '',
    '**TTS log:**',
    '```',
    trimLog(ttsLog, MAX_LOG_CHARS),
    '```',
  ].join('\n');

  const url =
    `https://github.com/${GITHUB_REPO}/issues/new` +
    `?title=${encodeURIComponent('Bug: ')}` +
    `&body=${encodeURIComponent(body)}` +
    `&labels=${encodeURIComponent('bug')}`;

  await Linking.openURL(url);
}

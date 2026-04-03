import {Platform, Linking} from 'react-native';
import {APP_VERSION} from '../constants/version';
import {useRadarStore} from '../ble/radarStore';

const GITHUB_REPO = 'nav1885/VoxRider';

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

export async function openBugReport(): Promise<void> {
  const {debugTTSLog, connectionStatus, threats} = useRadarStore.getState();

  const ttsLines = debugTTSLog
    ? debugTTSLog
        .split('\n')
        .filter(Boolean)
        .slice(-10)
        .map(l => `  - ${l}`)
        .join('\n')
    : '  (none)';

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
    `- Last TTS events:`,
    ttsLines,
  ].join('\n');

  const url =
    `https://github.com/${GITHUB_REPO}/issues/new` +
    `?title=${encodeURIComponent('Bug: ')}` +
    `&body=${encodeURIComponent(body)}` +
    `&labels=${encodeURIComponent('bug')}`;

  // canOpenURL returns false for https on Android 11+ without a <queries> manifest entry.
  // openURL works regardless — let it throw naturally if no browser is installed.
  await Linking.openURL(url);
}

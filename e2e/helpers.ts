import {execSync} from 'child_process';
import {writeFileSync, mkdirSync} from 'fs';
import {device} from 'detox';

const SIM_ID = '174B7551-BA0C-46FE-AD1F-EF7AB543968A';
const IOS_BUNDLE_ID = 'com.voxrider';

function iosStoragePath(): string {
  const container = execSync(
    `xcrun simctl get_app_container ${SIM_ID} ${IOS_BUNDLE_ID} data 2>/dev/null`,
  )
    .toString()
    .trim();
  return `${container}/Library/Application Support/${IOS_BUNDLE_ID}/RCTAsyncLocalStorage_V1`;
}

const ANDROID_BUNDLE = 'com.nav1885.voxrider';
const ADB = '/Users/nav1885/Library/Android/sdk/platform-tools/adb';

// MD5('@voxrider_settings') — key used by settingsStore
const IOS_SETTINGS_FILE = 'e51f3e3d436ca803bfcd5452525051e1';

function makeSettings(pairedDevices: object[], debugMode: boolean): string {
  return JSON.stringify({
    verbosity: 'minimal',
    units: 'imperial',
    pairedDevices,
    voiceId: null,
    debugMode,
    sidebarPosition: 'left',
  });
}

// Seed: one fake paired device → app boots straight to Main (no pairing screen)
const SEED_MAIN = makeSettings([{id: 'detox-test-device', name: 'RTL-TEST', rssi: -60}], false);
// Seed: no devices + debugMode=true → app boots to pairing screen, skip button visible
const SEED_PAIRING = makeSettings([], true);

async function seedAndLaunch(seed: string): Promise<void> {
  try {
    if (device.getPlatform() === 'ios') {
      const storagePath = iosStoragePath();
      execSync(`rm -rf "${storagePath}" 2>/dev/null || true`);
      mkdirSync(storagePath, {recursive: true});
      // Small values are stored inline in manifest.json (not in MD5-hashed files)
      const manifest = JSON.stringify({'@voxrider_settings': seed});
      writeFileSync(`${storagePath}/manifest.json`, manifest);
    } else {
      execSync(`${ADB} -e shell pm clear ${ANDROID_BUNDLE} 2>/dev/null || true`);
      const escaped = seed.replace(/'/g, "''");
      const tmpDb = '/tmp/voxrider_rkstorage.db';
      execSync(
        `sqlite3 ${tmpDb} "` +
          `CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL);` +
          `INSERT OR REPLACE INTO catalystLocalStorage VALUES('@voxrider_settings', '${escaped}');"`,
      );
      execSync(`${ADB} -e root 2>/dev/null || true`);
      execSync(`${ADB} -e shell mkdir -p /data/data/${ANDROID_BUNDLE}/databases`);
      execSync(`${ADB} -e push ${tmpDb} /data/data/${ANDROID_BUNDLE}/databases/RKStorage`);
    }
  } catch {}

  await device.launchApp({
    newInstance: true,
    permissions: {bluetooth: 'YES', notifications: 'YES'},
  });
}

/** Launch with a seeded paired device — app boots straight to main screen */
export async function launchFresh(): Promise<void> {
  await seedAndLaunch(SEED_MAIN);
}

/** Launch with no paired devices + debugMode on — app boots to pairing screen, skip visible */
export async function launchFreshAtPairing(): Promise<void> {
  await seedAndLaunch(SEED_PAIRING);
}

/** Wait for main screen — app boots directly here when a paired device is seeded */
export async function skipToMainScreen(): Promise<void> {
  const {by, element, waitFor} = require('detox');
  await waitFor(element(by.id('main-screen'))).toBeVisible().withTimeout(8000);
}

/** Navigate to main screen via the debug skip button (pairing tests only) */
export async function skipPairingToMain(): Promise<void> {
  const {by, element, waitFor} = require('detox');
  await waitFor(element(by.id('debug-skip-button'))).toBeVisible().withTimeout(5000);
  await element(by.id('debug-skip-button')).tap();
  await waitFor(element(by.id('main-screen'))).toBeVisible().withTimeout(5000);
}

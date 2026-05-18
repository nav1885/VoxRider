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

function adbEmulatorSerial(): string {
  const out = execSync(`${ADB} devices`).toString();
  const match = out.match(/^(emulator-\d+)\s+device/m);
  if (!match) throw new Error('No emulator found in adb devices');
  return match[1];
}

// MD5('@voxrider_settings') — key used by settingsStore
const IOS_SETTINGS_FILE = 'e51f3e3d436ca803bfcd5452525051e1';

function makeSettings(pairedDevices: object[], debugMode: boolean): string {
  return JSON.stringify({
    verbosity: 'minimal',
    units: 'imperial',
    pairedDevices,
    voiceId: null,
    debugMode,
  });
}

// Seed: one fake paired device → app boots straight to Main (no pairing screen)
const SEED_MAIN = makeSettings([{id: 'detox-test-device', name: 'RTL-TEST', rssi: -60}], false);
// Seed: no devices + debugMode=true → app boots to pairing screen, skip button visible
const SEED_PAIRING = makeSettings([], true);

async function seedAndLaunch(seed: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[seed] platform:', device.getPlatform());
  try {
    if (device.getPlatform() === 'ios') {
      const storagePath = iosStoragePath();
      execSync(`rm -rf "${storagePath}" 2>/dev/null || true`);
      mkdirSync(storagePath, {recursive: true});
      // Small values are stored inline in manifest.json (not in MD5-hashed files)
      const manifest = JSON.stringify({'@voxrider_settings': seed});
      writeFileSync(`${storagePath}/manifest.json`, manifest);
    } else {
      const serial = adbEmulatorSerial();
      const adb = `${ADB} -s ${serial}`;
      // pm clear wipes notification channels → Android treats every foreground service
      // notification as new and pulls down the shade. Only clear for pairing tests
      // (which don't reach the main screen / foreground service).
      if (seed === SEED_PAIRING) {
        console.log('[seed] 1. pm clear');
        execSync(`${adb} shell pm clear ${ANDROID_BUNDLE} 2>/dev/null || true`);
      } else {
        console.log('[seed] 1. skip pm clear (preserve notification channel)');
      }
      console.log('[seed] 2. create sqlite');
      const escaped = seed.replace(/'/g, "''");
      const tmpDb = '/tmp/voxrider_rkstorage.db';
      const sqlFile = '/tmp/voxrider_seed.sql';
      execSync(`rm -f ${tmpDb}`);
      // Write SQL to file to avoid shell double-quote escaping stripping JSON quotes
      writeFileSync(sqlFile, [
        'PRAGMA user_version=1;',
        'CREATE TABLE catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
        `INSERT INTO catalystLocalStorage VALUES('@voxrider_settings', '${escaped}');`,
      ].join('\n'));
      execSync(`sqlite3 ${tmpDb} < ${sqlFile}`);
      console.log('[seed] 3. push to tmp');
      execSync(`${adb} push ${tmpDb} /data/local/tmp/RKStorage`);
      console.log('[seed] 4. mkdir databases');
      execSync(`${adb} shell "run-as ${ANDROID_BUNDLE} mkdir -p databases"`);
      console.log('[seed] 5. cp to databases');
      execSync(`${adb} shell "run-as ${ANDROID_BUNDLE} cp /data/local/tmp/RKStorage databases/RKStorage"`);
      console.log('[seed] 6. verify');
      const verify = execSync(`${adb} shell "run-as ${ANDROID_BUNDLE} ls -la databases/RKStorage"`).toString().trim();
      console.log('[seed] verify:', verify);
      console.log('[seed] 7. grant permissions');
      const perms = [
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_CONNECT',
      ];
      for (const perm of perms) {
        const result = execSync(`${adb} shell pm grant ${ANDROID_BUNDLE} ${perm} 2>&1 || true`).toString().trim();
        console.log(`[seed] grant ${perm}: ${result || 'ok'}`);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[seed] ERROR:', e);
  }

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
  await waitFor(element(by.id('main-screen'))).toBeVisible().withTimeout(12000);
}

/** Navigate to main screen via the debug skip button (pairing tests only) */
export async function skipPairingToMain(): Promise<void> {
  const {by, element, waitFor} = require('detox');
  await waitFor(element(by.id('debug-skip-button'))).toBeVisible().withTimeout(5000);
  await element(by.id('debug-skip-button')).tap();
  await waitFor(element(by.id('main-screen'))).toBeVisible().withTimeout(5000);
}

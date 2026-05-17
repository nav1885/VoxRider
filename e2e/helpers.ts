import {execSync} from 'child_process';
import {device} from 'detox';

const SIM_ID = '174B7551-BA0C-46FE-AD1F-EF7AB543968A';
const IOS_STORAGE_PATH =
  `${process.env.HOME}/Library/Developer/CoreSimulator/Devices/${SIM_ID}` +
  `/data/Containers/Data/Application/859F72CC-4B49-41A0-ACF3-469626D87C74` +
  `/Library/Application Support/com.voxrider/RCTAsyncLocalStorage_V1`;

const ANDROID_BUNDLE = 'com.nav1885.voxrider';
const ADB = '/Users/nav1885/Library/Android/sdk/platform-tools/adb';

/** Wipe app storage and launch fresh on either platform */
export async function launchFresh(): Promise<void> {
  try {
    if (device.getPlatform() === 'ios') {
      execSync(`rm -rf "${IOS_STORAGE_PATH}" 2>/dev/null || true`);
    } else {
      // Android: clear app data instantly without reinstall
      execSync(`${ADB} -e shell pm clear ${ANDROID_BUNDLE} 2>/dev/null || true`);
    }
  } catch {}

  await device.launchApp({
    newInstance: true,
    permissions: {bluetooth: 'YES', notifications: 'YES'},
  });
}

/** Navigate to main screen via the debug skip button */
export async function skipToMainScreen(): Promise<void> {
  const {by, element, waitFor} = require('detox');
  await waitFor(element(by.id('debug-skip-button')))
    .toBeVisible()
    .withTimeout(5000);
  await element(by.id('debug-skip-button')).tap();
  await waitFor(element(by.id('main-screen'))).toBeVisible().withTimeout(5000);
}

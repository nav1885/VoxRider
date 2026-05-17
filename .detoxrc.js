/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  behavior: {
    init: {
      exposeGlobals: true,
    },
  },
  apps: {
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/VoxRider.app',
      build: [
        'npx react-native bundle',
        '--platform ios --dev false',
        '--entry-file index.js',
        '--bundle-output ios/main.jsbundle',
        '--assets-dest ios/assets',
        '&&',
        'xcodebuild',
        '-workspace ios/VoxRider.xcworkspace',
        '-scheme VoxRider',
        '-configuration Release',
        '-sdk iphonesimulator',
        '-destination "id=174B7551-BA0C-46FE-AD1F-EF7AB543968A"',
        '-derivedDataPath ios/build',
        'build',
      ].join(' '),
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: [
        'npx react-native bundle',
        '--platform android --dev false',
        '--entry-file index.js',
        '--bundle-output android/app/src/main/assets/index.android.bundle',
        '--assets-dest android/app/src/main/res',
        '&&',
        'JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home',
        'ANDROID_SDK_ROOT=/Users/nav1885/Library/Android/sdk',
        './android/gradlew assembleDebug assembleAndroidTest --no-daemon -p android',
      ].join(' '),
      reversePorts: [8081],
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {id: '174B7551-BA0C-46FE-AD1F-EF7AB543968A'},
    },
    emulator: {
      type: 'android.emulator',
      device: {avdName: 'Pixel_10'},
    },
  },
  configurations: {
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};

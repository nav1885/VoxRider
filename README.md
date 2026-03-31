# VoxRider

React Native app that connects to a Garmin Varia RTL515 bike radar via Bluetooth and delivers spoken TTS voice alerts through your earbuds — hands-free, eyes-free situational awareness for road cyclists.

---

## What it does

- Scans for and pairs with a Garmin Varia RTL515 radar
- Displays approaching vehicles on a visual sidebar strip (Wahoo-style, full screen height)
- Announces threats via TTS: *"2 vehicles, high speed"* / *"Clear"*
- Auto-reconnects on disconnect, announces *"Radar disconnected"* / *"Radar reconnected"*
- Works in the background (screen locked, app backgrounded) via Android foreground service + iOS background BLE

---

## Prerequisites

- Node.js ≥ 18
- React Native environment set up per [reactnative.dev/docs/set-up-your-environment](https://reactnative.dev/docs/set-up-your-environment)
- iOS: Xcode 15+, iOS 15+ device or simulator
- Android: Android Studio, API 26+ device or emulator

---

## Setup

```sh
# Install dependencies
npm install

# iOS — install CocoaPods
cd ios && pod install && cd ..
```

---

## Running

```sh
# Start Metro bundler
npm start

# iOS (separate terminal)
npm run ios

# Android (separate terminal)
npm run android
```

---

## Tests

```sh
npm test
```

128 tests across 12 suites:
- BLE packet parser (18 tests)
- Alert engine — trigger logic, throttle, debounce (19 tests)
- TTS engine — snapshot-on-completion, watchdog, escalation (10 tests)
- Connection alert engine — disconnect/reconnect/backoff (12 tests)
- Alert message builder — verbosity levels (9 tests)
- End-to-end alert pipeline integration (5 tests)
- RadarStrip component (8 tests)
- MainScreen component (13 tests)
- SettingsPanel component (10 tests)
- PairingStep1 + PairingStep2 screens (10 tests)
- Bluetooth permissions hook + banner (13 tests)
- App launch routing (1 test)

---

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for full data flow, BLE protocol details, component structure, and alert engine rules.

Key files:

| Path | What it does |
|------|-------------|
| `src/ble/RealBLEManager.ts` | BLE scan/connect/subscribe via react-native-ble-plx |
| `src/ble/MockBLEManager.ts` | Test double — used in all JS tests and dev builds |
| `src/ble/parseRadarPacket.ts` | Decodes raw Varia BLE packets → `Threat[]` |
| `src/ble/radarStore.ts` | Zustand store for high-frequency BLE state |
| `src/alerts/AlertEngine.ts` | Threat state → alert trigger decisions |
| `src/alerts/TTSEngine.ts` | Snapshot-on-completion, escalation interrupt, watchdog |
| `src/alerts/NativeTTSBackend.ts` | react-native-tts wrapper (audio ducking, rate) |
| `src/alerts/ConnectionAlertEngine.ts` | Disconnect/reconnect TTS + exponential backoff |
| `src/alerts/NoOpTTSBackend.ts` | Dev placeholder — logs to console, no native TTS |
| `src/settings/settingsStore.ts` | Zustand + AsyncStorage for persisted settings |
| `src/permissions/useBluetoothPermission.ts` | BLE permission request by Android API level |
| `src/ui/screens/MainScreen.tsx` | Radar strip + threat state + battery bar |
| `src/ui/screens/SettingsPanel.tsx` | Verbosity / units / sidebar / paired devices |
| `src/ui/screens/PairingStep1.tsx` | Turn on Varia — step 1 of pairing |
| `src/ui/screens/PairingStep2.tsx` | Scan + connect — step 2 of pairing |
| `android/app/src/main/java/com/voxrider/RadarService.kt` | Android foreground service |

---

## Switching from Mock to Real BLE

The app currently uses `MockBLEManager` in `App.tsx`. To use real BLE once native tools are available:

1. In `App.tsx`, replace:
   ```ts
   import {MockBLEManager} from './src/ble/MockBLEManager';
   const bleManager = new MockBLEManager();
   ```
   with:
   ```ts
   import {RealBLEManager} from './src/ble/RealBLEManager';
   const bleManager = new RealBLEManager();
   ```

2. Replace `NoOpTTSBackend` with `NativeTTSBackend`:
   ```ts
   import {NativeTTSBackend} from './src/alerts/NativeTTSBackend';
   const ttsBackend = new NativeTTSBackend();
   await ttsBackend.initialize(); // call this once on app start
   ```

---

## BLE Protocol

Garmin Varia RTL515 uses a reverse-engineered protocol (community research via pycycling/harbour-tacho):

- **Service UUID:** `6A4E3200-667B-11E3-949A-0800200C9A66`
- **Radar characteristic:** `6A4E3203-667B-11E3-949A-0800200C9A66`
- **Battery:** Standard BLE Battery Service `0x180F` / `0x2A19`
- **Packet format:** 1-byte header (`seq_id:4 | count:4`) + 3 bytes/threat (speed uint8 m/s, distance uint8 m, flags bits 7–6 = threat level)
- **Split packets:** >6 threats split across two packets, reassembled by shared sequence ID (500ms timeout)

> **Distribution note:** Using a reverse-engineered protocol carries App Store / Play Store risk. v1 strategy: Android APK sideload / iOS personal dev cert / open-source GitHub.

---

## Demo Mode

Hold the Varia power button for 6 seconds to enter demo mode — simulates threat sequences without a real vehicle. Use this for testing the full alert pipeline without riding.

---

## Pinned versions

- React Native: 0.84.1
- Node.js: ≥ 18.0.0
- Android minSdk: 26 (Android 8.0)
- iOS minimum: 15.0

# VoxRider — Claude Code Instructions

## Android Build & Deploy

When asked to build and test on Android, always follow this workflow without asking for confirmation. Assume the developer's personal device is connected and discoverable via ADB.

### Steps (always in this order)

1. **Bundle JS into assets** — never use Metro, always pre-bundle:
   ```bash
   npx react-native bundle \
     --platform android \
     --dev false \
     --entry-file index.js \
     --bundle-output android/app/src/main/assets/index.android.bundle \
     --assets-dest android/app/src/main/res
   ```

2. **Build release AAB** for Play Store (default):
   ```bash
   cd android && ./gradlew bundleRelease --no-daemon
   ```
   AAB output: `android/app/build/outputs/bundle/release/app-release.aab`

   For sideload / device testing, build an APK instead:
   ```bash
   cd android && ./gradlew assembleRelease --no-daemon
   ```
   APK output: `android/app/build/outputs/apk/release/app-release.apk`

   Use `assembleDebug` / `bundleDebug` only if explicitly asked, or if the keystore is unavailable.

3. **Find the device transport ID**:
   ```bash
   adb devices -l
   ```
   Pick the transport_id for the connected device (there may be two entries for the same phone — use either).

4. **Install** (APK only — AAB goes to Play Console, not direct install):
   ```bash
   adb -t <transport_id> install -r android/app/build/outputs/apk/release/app-release.apk
   ```

### Rules
- Never start or kill Metro — JS is always bundled into the APK/AAB.
- Always build release unless told otherwise.
- Keystore lives at `android/app/voxrider-release.keystore` with properties in `android/keystore.properties`.
- Transport ID changes on every ADB daemon restart — always run `adb devices -l` first.
- If no device is found, wait for the user to confirm it's connected and retry.

## Garmin Varia BLE Protocol

- **Update rate:** 1 Hz — one packet per second regardless of threat state
- **Detection range:** 140 m
- **Service UUID:** `6A4E3200-667B-11E3-949A-0800200C9A66`
- **Radar characteristic:** `6A4E3203-667B-11E3-949A-0800200C9A66`

### Packet format (empirically verified — RTL515 demo mode + pycycling source)

```
Byte 0:   [rolling_counter: upper 4 bits][0x2: lower 4 bits — always, NOT a count]
Per threat (3 bytes, repeated):
  Byte 0: vehicleId  uint8 — persistent per physical vehicle across packets
  Byte 1: distance   uint8 meters — decreases as vehicle approaches
  Byte 2: speed      uint8 km/h — bits 7-6 = level (00=none,01=medium,10=high,11=unknown)

Threat count = (packet_length - 1) / 3
```

**Critical:** The lower nibble of byte 0 is always `0x2`. It is NOT a threat count. Never use it as one — doing so causes single-threat (4-byte) packets to be misclassified as fragments and silently dropped.

**Canonical test vectors** (demo mode, 2025-04):
- `82 A5 76 58 AE 89 44` → 2 threats: `{vId=0xA5,d=118m,s=88km/h,M}` `{vId=0xAE,d=137m,s=68km/h,M}`
- `82 AE 2B 44` → 1 threat: `{vId=0xAE,d=43m,s=68km/h,M}`
- `82` → clear

**Sources:** Garmin forum (https://forums.garmin.com/developer/connect-iq/f/discussion/240452/bluetooth-profile-for-garmin-varia-rtl515), pycycling `rear_view_radar.py` (https://github.com/zacharyedwardbull/pycycling)

## Alert Logic

- Triggers: **count changes only** (up or down). Level/speed never triggers audio.
- Debounce: **750ms**, cap **3s**
- Clear debounce: **1.5s**, cap **3s**
- TTS watchdog: **6s** (utterances run up to ~3.5s at 0.65 speech rate)
- TTS always finishes in full — no interruptions under any circumstance.
- Level/speed included in the spoken message as the **max** seen during the debounce window.

## iOS Build & Deploy

### Simulator (for Detox tests)
The test simulator is **iPhone 17 Pro** with UDID `174B7551-BA0C-46FE-AD1F-EF7AB543968A`. Build with:
```bash
npx react-native bundle --platform ios --dev false --entry-file index.js \
  --bundle-output ios/main.jsbundle --assets-dest ios/assets

xcodebuild -workspace ios/VoxRider.xcworkspace -scheme VoxRider \
  -configuration Release -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=174B7551-BA0C-46FE-AD1F-EF7AB543968A' \
  -derivedDataPath ios/build
```

### Physical device (development cert only)
- Apple Development cert: `Apple Development: nhc002@gmail.com (MNCHP8DR5H)`
- Distribution cert pending Apple Developer Program activation
- Wife's iPhone UDID: `00008150-000C4C5C118A401C` (paired wirelessly)

```bash
xcodebuild -workspace ios/VoxRider.xcworkspace -scheme VoxRider \
  -configuration Release -destination 'platform=iOS,id=<UDID>' \
  -allowProvisioningUpdates -derivedDataPath ios/build-device

xcrun devicectl device install app --device <UDID> \
  ios/build-device/Build/Products/Release-iphoneos/VoxRider.app
```

After install, user must trust the dev cert: **Settings → General → VPN & Device Management → trust the developer**.

## E2E Testing (Detox)

### Running
- iOS:     `npm run e2e:test:ios` (configuration `ios.sim.release`)
- Android: `npm run e2e:test:android` (configuration `android.emu.debug`)

The android script (`scripts/run-android-tests.sh`) manages emulator lifecycle: reuses a running `Pixel_10` AVD if present, otherwise boots one. Always clears Detox's stale device registry at `~/Library/Detox/device.registry.json` first.

### State seeding (Android)
- iOS uses `manifest.json` (RNCAsyncStorage stores small values inline)
- Android uses a SQLite file pushed via `adb push` + `run-as cp` (`RKStorage` at `databases/RKStorage`)
- **Critical:** SQLite seed file must set `PRAGMA user_version=1` — without it, `SQLiteOpenHelper` calls `onUpgrade` which drops the seeded table
- **Critical:** Write SQL to a temp file, not a `-c` shell argument — shell double-quote wrapping strips JSON quotes silently
- `launchFresh()` seeds a fake paired device → app boots straight to main screen
- `launchFreshAtPairing()` seeds `debugMode: true` + no paired devices → app shows pairing screen with skip button visible
- **Skip `pm clear` for main-screen tests** — it wipes the notification channel and Android pulls down the shade for every "new" foreground-service notification, obscuring main-screen

### Detox device registry
After any interrupted run, the stale serial in `~/Library/Detox/device.registry.json` will cause `adb: device 'emulator-XXXXX' not found` errors. The npm script clears it before every run.

## App Icon

Source: `store-assets/icon-512.png` (currently 512×512, gets upscaled to 1024 for iOS). For regeneration:
- Use `/tmp/gen_icon.py` template — crops tight on the bike/radar art, removes the "VoxRider" wordmark (the OS shows the app name below the icon anyway), and emits all iOS AppIcon sizes + Android mipmap densities + foreground/round variants
- Apple guideline: 1024×1024 App Store icon **must not** have alpha channel — script saves as RGB
- Android adaptive icon foreground: 108dp canvas with art in inner 72dp safe zone (script handles)

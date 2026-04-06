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

2. **Build release APK** (default — not debug):
   ```bash
   cd android && ./gradlew assembleRelease --no-daemon
   ```
   APK output: `android/app/build/outputs/apk/release/app-release.apk`

   Use `assembleDebug` only if explicitly asked, or if the keystore is unavailable.

3. **Find the device transport ID**:
   ```bash
   adb devices -l
   ```
   Pick the transport_id for the connected device (there may be two entries for the same phone — use either).

4. **Install**:
   ```bash
   adb -t <transport_id> install -r android/app/build/outputs/apk/release/app-release.apk
   ```

### Rules
- Never start or kill Metro — JS is always bundled into the APK.
- Always build release unless told otherwise.
- Keystore lives at `android/app/voxrider-release.keystore` with properties in `android/keystore.properties`.
- Transport ID changes on every ADB daemon restart — always run `adb devices -l` first.
- If no device is found, wait for the user to confirm it's connected and retry.

## Garmin Varia BLE Protocol

- **Update rate:** 1 Hz — one packet per second regardless of threat state
- **Detection range:** 140 m
- **Protocol reference:** https://forums.garmin.com/developer/connect-iq/f/discussion/240452/bluetooth-profile-for-garmin-varia-rtl515

## Alert Logic

- Triggers: **count changes only** (up or down). Level/speed never triggers audio.
- Debounce: **2s**, cap **4s**
- Clear debounce: **3s**, cap **5s**
- TTS always finishes in full — no interruptions under any circumstance.
- Level/speed included in the spoken message as the **max** seen during the debounce window.

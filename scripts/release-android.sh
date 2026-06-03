#!/usr/bin/env bash
# One-command Android release → Google Play internal track (local build, via fastlane).
# Bumps versionCode, then runs `fastlane android_release` (signed .aab → Play internal, draft).
#
# Requires:
#   - upload keystore: android/app/voxrider-release.keystore + android/keystore.properties
#   - Google Play service-account JSON: path set as PLAY_JSON_KEY_FILEPATH in fastlane/.env
#   - the Play app listing to already exist (one-time, manual — no API to create it)
# If the keystore is lost, do a Play Console upload-key reset first (generate a new key,
# register its cert under Setup → App integrity → App signing).
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"; export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

# Fail fast with a clear message BEFORE bumping anything.
if [ ! -f android/app/voxrider-release.keystore ] || [ ! -f android/keystore.properties ]; then
  echo "✗ Release keystore missing (android/app/voxrider-release.keystore + android/keystore.properties)."
  echo "  Restore it, or do a Play Console upload-key reset. Without it the build is debug-signed and Play rejects it."
  exit 1
fi

GRADLE=android/app/build.gradle
cur=$(grep -oE 'versionCode [0-9]+' "$GRADLE" | grep -oE '[0-9]+' | head -1)
next=$(( cur + 1 ))
sed -i '' "s/versionCode ${cur}/versionCode ${next}/" "$GRADLE"
echo "▶ Android versionCode ${cur} → ${next}"

echo "▶ building signed .aab + uploading to Play internal (fastlane)…"
fastlane android_release

echo "✅ Android versionCode ${next} → Play internal track (draft). Promote in Play Console when ready."

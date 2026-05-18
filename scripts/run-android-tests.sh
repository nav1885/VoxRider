#!/usr/bin/env bash
set -e

ADB=/Users/nav1885/Library/Android/sdk/platform-tools/adb
EMULATOR=/Users/nav1885/Library/Android/sdk/emulator/emulator
AVD=Pixel_10

# 1. Check if emulator already running; if not, start one
SERIAL=$($ADB devices | grep "^emulator" | grep "device$" | awk '{print $1}' | head -1)

if [ -z "$SERIAL" ]; then
  echo "[detox] No emulator running — starting $AVD..."
  $EMULATOR -avd $AVD -no-snapshot-load -no-audio -no-boot-anim &
  echo "[detox] Waiting for emulator to come online..."
  $ADB wait-for-device
  until $ADB shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; do
    sleep 2
  done
  SERIAL=$($ADB devices | grep "^emulator" | grep "device$" | awk '{print $1}' | head -1)
  echo "[detox] Emulator online: $SERIAL"
else
  echo "[detox] Reusing running emulator: $SERIAL"
fi

# 2. Clear Detox device registry
echo '[]' > ~/Library/Detox/device.registry.json

# 6. Run Detox with android.emu.debug — uses am instrument for proper UI access
echo "[detox] Running tests..."
ANDROID_SDK_ROOT=/Users/nav1885/Library/Android/sdk \
  npx detox test --configuration android.emu.debug

EXIT_CODE=$?

# 7. Kill the emulator when done
echo "[detox] Tests done (exit $EXIT_CODE). Shutting down emulator..."
$ADB -s "$SERIAL" emu kill 2>/dev/null || true
echo '[]' > ~/Library/Detox/device.registry.json

exit $EXIT_CODE

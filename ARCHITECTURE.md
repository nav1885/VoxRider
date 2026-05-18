# VoxRider — Architecture

## Overview

VoxRider is a React Native (TypeScript) app that connects to a Garmin Varia RTL515 bike radar via BLE and delivers spoken TTS voice alerts through the rider's earbuds.

**React Native version:** 0.84.1 (pinned — do not upgrade without testing on physical devices)

---

## Folder Structure

```
src/
  ble/          BLE manager, packet parser, radar Zustand store, types
  alerts/       Connection alert engine, message builder, TTS backend, types
  ui/
    screens/    PairingStep1, PairingStep2, Main, Settings
    components/ AppHeader, RoadView, threat banner
  settings/     Settings Zustand store, formatDistance, types
  debug/        DebugSimulator — burst-based threat simulation for on-device testing
  constants/    strings.ts — all user-facing strings

android/app/src/main/java/com/voxrider/
  VoxTTSModule.kt   Custom Android TTS wrapper (QUEUE_FLUSH, STREAM_ALARM)
  VoxTTSPackage.kt  ReactPackage registration for VoxTTSModule
```

---

## Data Flow

```
Garmin Varia (BLE)
    │
    ▼
RealBLEManager (react-native-ble-plx)
    │  raw BLE notifications
    ▼
parseRadarPacket() → Threat[]
    │
    ├──► useRadarStore (Zustand) ──► RoadView (visual, ~200ms)
    │
    └──► useRadarStore.subscribe() [App.tsx module level]
              │
              ▼
         announceThreats(count, maxLevel)
              │  buildAlertMessage(verbosity)   2s debounce on "Clear"
              ▼
         NativeTTSBackend
              ├── Android: VoxTTSModule (custom Kotlin, QUEUE_FLUSH, STREAM_ALARM)
              └── iOS: react-native-tts (AVAudioSession .duckOthers)
                        │
                        ▼
                   Rider's earbuds
```

---

## TTS Architecture

### The QUEUE_ADD problem (Android)

`react-native-tts` uses `TextToSpeech.QUEUE_ADD` internally. On Android 12+ and Samsung devices, after the first utterance completes the TTS engine enters a state where subsequent `QUEUE_ADD` calls return `SUCCESS` but are silently dropped — `tts-start` never fires.

### Solution: VoxTTSModule (Android only)

A custom Kotlin native module (`VoxTTSModule.kt`) bypasses react-native-tts entirely on Android:

- Uses `TextToSpeech.QUEUE_FLUSH` — resets engine state before each utterance
- Audio attributes: `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` + `CONTENT_TYPE_SPEECH` — routes to earbuds/BT headphones, ducks music, works in background
- Audio focus: `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` — music ducks while speaking
- Speech rate: `0.65f` (crisp but clear for helmet/wind noise)
- Emits `VoxTTSEvent` via `RCTDeviceEventEmitter` for all lifecycle events (start, done, stop, error)

`RadarService.kt` declares `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE | FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK` (Android 14+) — required for background audio playback from a foreground service.

### iOS

react-native-tts with `AVAudioSession .duckOthers`. Speech rate: `0.45`.

### NativeTTSBackend

`src/alerts/NativeTTSBackend.ts` branches at runtime:

```typescript
if (Platform.OS === 'android') {
  VoxTTS?.speak(utterance);   // custom module, QUEUE_FLUSH
} else {
  Tts.stop();
  Tts.speak(utterance);       // react-native-tts
}
```

VoxTTSEvent callbacks write to `debugStore.ttsLog` (isolated from `radarStore` to avoid triggering the Zustand BLE subscription feedback loop).

### Background JS timer throttling (Android)

When the app is backgrounded, Android pauses React Native's `ReactChoreographer`. This stops all `setTimeout`/`setInterval` callbacks from firing — including `AlertEngine`'s debounce and cap timers. BLE notification callbacks still run (they're native bridge, synchronous) and `console.log` / `Date.now()` still work.

**Fix:** `AlertEngine` and `TTSEngine` track `Date.now()` timestamps when debounce windows start. Every incoming BLE packet acts as an implicit timer check — if the wall-clock window has elapsed, the alert fires synchronously without needing a timer. In foreground, the real `setTimeout` fires first as usual; in background, the synchronous check fires on the first packet after the window elapses.

---

## Announcement Logic

`announceThreats()` in `App.tsx` (module level, not inside a component):

- Fires on every `useRadarStore.subscribe()` callback
- **Deduplication**: compares `count` to `lastAnnouncedCount` — skips if unchanged
- **Clear debounce**: 2s delay before announcing "Clear" — avoids false clears when a car briefly dips to 0
- **Verbosity**: reads `useSettingsStore.getState().verbosity` at speak time — respects Detailed / Balanced / Minimal

Alert message format (via `buildAlertMessage()`):

| Verbosity | Single vehicle | Multiple |
|---|---|---|
| Detailed | "1 vehicle, medium speed" | "3 vehicles, high speed" |
| Balanced | "1 vehicle" | "3 vehicles" |
| Minimal | "car" | "3 cars" |

---

## State Management

### useRadarStore

| Field | Type | Purpose |
|---|---|---|
| `threats` | `Threat[]` | Current radar threats (high-frequency updates) |
| `connectionStatus` | `ConnectionStatus` | BLE connection state |
| `connectedDevice` | `DeviceInfo \| null` | Name/ID of connected Varia |
| `batteryLevel` | `number \| null` | Varia battery % (0–100) |
| `consecutiveFailures` | `number` | Connect failures — drives conflict hint at ≥3 |
| `debugLastAnnouncement` | `string` | Last message passed to TTS (debug display — use `debugStore.lastAnnouncement`) |

### useSettingsStore

| Field | Type | Persisted | Purpose |
|---|---|---|---|
| `verbosity` | `AlertVerbosity` | Yes | TTS announcement detail level |
| `units` | `'imperial' \| 'metric'` | Yes | Distance display |
| `pairedDevices` | `DeviceInfo[]` | Yes | Saved Varia devices |
| `debugMode` | `boolean` | No | Shows debug UI + simulator in MainScreen |

Selector-based subscriptions prevent cascade re-renders from high-frequency BLE updates.

### useDebugStore

| Field | Type | Purpose |
|---|---|---|
| `alertLog` | `string` | AlertEngine decisions — what it intended to announce |
| `ttsLog` | `string` | TTS execution — VoxTTSEvent lifecycle from native module |
| `lastAnnouncement` | `string` | Most recently spoken utterance string |
| `packetLog` | `string` | Raw BLE packet log — hex bytes + parsed threats per notification (60-entry circular buffer, ~1 min at 1 Hz) |

Isolated from `radarStore` so log updates never trigger the BLE subscription callback loop. Used by the bug reporter (`src/utils/bugReport.ts`) and the on-screen debug panel.

---

## BLE Protocol

**Service UUID:** `6A4E3200-667B-11E3-949A-0800200C9A66`
**Radar characteristic:** `6A4E3203-667B-11E3-949A-0800200C9A66`
**Battery service:** `0x180F` (standard BLE)
**Battery characteristic:** `0x2A19` (standard BLE — uint8, 0–100%)

Packet format (verified against real hardware + pycycling source):
```
Byte 0: [rolling_counter: upper 4 bits][protocol_constant: lower 4 bits — always 0x2]
Per threat (3 bytes each):
  Byte 0: vehicleId  (uint8) — persistent ID per physical vehicle, constant across packets
  Byte 1: distance   (uint8 meters) — decreases as vehicle approaches
  Byte 2: speed      (uint8 km/h) — bits 7-6 = threat level (00=none,01=medium,10=high,11=unknown)

Threat count = (packet_length - 1) / 3
The lower nibble of byte 0 is NOT a threat count — it is always 0x2.
No split packets — the Varia never fragments; the lower nibble is not a fragment counter.
```

Canonical test vectors (RTL515 demo mode, 2025-04):
- `82 A5 76 58 AE 89 44` → 2 threats
- `82 AE 2B 44` → 1 threat
- `82` → clear

---

## Navigation

React Navigation stack:
```
PairingStep1 → PairingStep2 → Main ←→ Settings
```
- No back gesture on `Main` (`gestureEnabled: false`)
- `Main → Settings`: left swipe gesture (translationX < -60) or `onSwipeLeft` prop
- `Settings → Main`: horizontal swipe back (CardStyleInterpolators.forHorizontalIOS, inverted)
- On launch: check AsyncStorage for paired devices → route to pairing or Main

---

## Alert Engine Rules

`ConnectionAlertEngine` announces connection state changes via TTS:

- `onFirstConnect()` → "Radar connected" (called once after pairing or auto-connect)
- Status → Connected (after prior disconnect) → "Radar reconnected"
- Status → Disconnected (after prior connection) → "Radar disconnected"
- Status → Scanning (never connected) → no announcement

Flags `hadConnection` and `wasDisconnected` prevent spurious announcements during the initial scan phase.

Threat alert rules (in `announceThreats()`):
1. Vehicle count increases → announce immediately
2. Vehicle count decreases to 0 → announce "Clear" after 2s debounce
3. Count unchanged → no announcement

Not triggers: de-escalation, same count, disconnected state.

`Unknown` threat level treated as `Medium` (conservative).

---

## Testing Conventions

| Layer | Tool |
|---|---|
| Pure logic (parser, alert engine, message builder) | Jest unit tests |
| React components | React Native Testing Library |

**Test count:** 126 tests across 8 suites.

Tests never import `RealBLEManager` or `NativeTTSBackend` — these require native modules unavailable in Jest.

---

## Debug Mode

Enable via Settings → DEBUG toggle (not persisted across restarts).

When active, `MainScreen` shows:
- `announced: "..."` — last message sent to TTS
- VoxTTS native event log — native TTS lifecycle events (start/done/error)
- **Simulate Threats** button — starts/stops `DebugSimulator`

### DebugSimulator

`src/debug/DebugSimulator.ts` — burst-based traffic simulation:

- Bursts of 1–3 vehicles, 2–4s between vehicles within a burst
- 5–10s gaps between bursts (simulates a quiet country road)
- MAX_CONCURRENT: 4 vehicles
- 300ms tick rate (matches real Varia BLE update rate ~200ms)
- Writes directly to `useRadarStore` — goes through the exact same `announceThreats()` and TTS path as real BLE data

---

## Platform Notes

### Android
- Minimum SDK: API 26 (Android 8.0)
- BLE permissions split by API level: `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` (API 31+), `ACCESS_FINE_LOCATION` (API ≤30)
- Foreground service with `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` (required API 34+)
- Battery optimization exemption required for background BLE reliability
- TTS: custom `VoxTTSModule.kt` (QUEUE_FLUSH + STREAM_ALARM) — does NOT use react-native-tts

### iOS
- Minimum: iOS 15
- Background BLE: `UIBackgroundModes: bluetooth-central` in Info.plist
- TTS: react-native-tts with `AVAudioSession .duckOthers`, speech rate 0.45

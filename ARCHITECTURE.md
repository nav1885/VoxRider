# VoxRider — Architecture

## Overview

VoxRider is a React Native (TypeScript) app that connects to a Garmin Varia RTL515 bike radar via BLE and delivers spoken TTS voice alerts through the rider's earbuds.

**React Native version:** 0.84.1 (pinned — do not upgrade without testing on physical devices)

---

## Folder Structure

```
src/
  ble/          BLE manager, packet parser, radar Zustand store, types
  alerts/       Alert engine (trigger logic, message builder), types
  ui/
    screens/    PairingStep1, PairingStep2, Main, Settings
    components/ RadarStrip, BatteryBar, ConflictHint, BatteryBanner
  settings/     Settings Zustand store, types
  services/     Android foreground service bridge
  constants/    strings.ts — all user-facing strings
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
    ├──► useRadarStore (Zustand) ──► RadarStrip (visual, ~200ms)
    │
    └──► AlertEngine.evaluate()
              │  AlertTrigger | null
              ▼
         TTSEngine (react-native-tts)
              │  speaks alert
              ▼
         Rider's earbuds
```

---

## State Management

Two Zustand stores:

| Store | Contents | Update frequency |
|---|---|---|
| `useRadarStore` | `threats`, `connectionStatus`, `connectedDevice`, `batteryLevel`, `consecutiveFailures` | High — every BLE packet (~200ms) |
| `useSettingsStore` | `sidebarPosition`, `verbosity`, `units`, `pairedDevices` | Low — on user action, persisted via AsyncStorage |

Selector-based subscriptions prevent cascade re-renders from high-frequency BLE updates.

---

## BLE Protocol

**Service UUID:** `6A4E3200-667B-11E3-949A-0800200C9A66`
**Radar characteristic:** `6A4E3203-667B-11E3-949A-0800200C9A66`
**Battery service:** `0x180F` (standard BLE)
**Battery characteristic:** `0x2A19` (standard BLE — uint8, 0–100%)

Packet format:
```
Byte 0: [sequence_id: 4 bits][threat_count: 4 bits]
Per threat (3 bytes):
  Byte 0: speed (uint8 m/s)
  Byte 1: distance (uint8 meters)
  Byte 2: flags (bits 7–6 = threat level: 0=none, 1=medium, 2=high, 3=unknown)
```

Split packets share a sequence ID. Reassembly timeout: 500ms.

---

## Navigation

React Navigation stack:
```
PairingStep1 → PairingStep2 → Main
```
- No back gesture on `Main` (`gestureEnabled: false`)
- On launch: check AsyncStorage for paired devices → route to pairing or Main

---

## Alert Engine Rules

Only three triggers:
1. Vehicle count increases
2. Max threat level escalates (Medium → High)
3. All clear (debounced 3s, capped 5s)

Not triggers: de-escalation, count decreases (partial), same state, disconnected.

`Unknown` threat level treated as `Medium` (conservative).

---

## Testing Conventions

| Layer | Tool |
|---|---|
| Pure logic (parser, alert engine, message builder) | Jest unit tests |
| React components | React Native Testing Library |
| Full pipeline (BLE → TTS) | Jest integration tests with MockBLEManager |
| Hardware/background reliability | Manual test checklists (see MILESTONES.md M6) |

**MockBLEManager** (`src/ble/MockBLEManager.ts`) implements `IBLEManager` for all automated tests. Never use `RealBLEManager` in tests.

---

## Demo Mode

To simulate threats without riding: hold the Varia power button for 6 seconds. The device enters demo mode and emits a sequence of fake threats. Used for hardware testing.

`MockBLEManager.emitDemoThreats()` replicates this in automated tests.

---

## Platform Notes

### Android
- Minimum SDK: API 26 (Android 8.0)
- BLE permissions split by API level: `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` (API 31+), `ACCESS_FINE_LOCATION` (API ≤30)
- Foreground service with `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` (required API 34+)
- Battery optimization exemption required for background BLE reliability (see REQ-CON-002a)

### iOS
- Minimum: iOS 15
- Background BLE: `UIBackgroundModes: bluetooth-central` in Info.plist
- Audio ducking: `AVAudioSession .duckOthers`

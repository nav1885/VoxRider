# VoxRider — Product Specification v1.0

---

## 1. Overview

**VoxRider** is a cross-platform mobile app (iOS + Android) that connects to a Garmin Varia RTL515 rear bike radar via Bluetooth Low Energy (BLE) and delivers spoken voice alerts through the rider's earbuds — announcing the number of approaching vehicles and their speed in real time.

**One-liner:** Spoken radar alerts for cyclists. No screen glance needed.

---

## 2. Problem Statement

Cyclists using a Garmin Varia radar today get beep/chime alerts. These alerts tell the rider _something is behind them_ — but nothing more. No count, no speed, no context. To get that information, the rider must look down at their head unit or phone screen, taking eyes off the road.

For riders using earbuds with music or podcasts, the beeps are easily missed. Wind noise at speed drowns them out. The Garmin Varia app ties alert volume to media volume — if music is loud, alerts are loud; if music is quiet, alerts are quiet. There is no separation.

**What riders actually need:** A clear spoken alert that interrupts their audio briefly, tells them exactly what is happening behind them, and lets them keep their eyes on the road.

---

## 3. Market Context

### Existing solutions

| App | Alert type | Voice/TTS | Varia BLE |
|---|---|---|---|
| Garmin Varia App (iOS + Android) | Beep + vibration | No | Yes (official) |
| Ride with GPS | Audio chime + map overlay | No | Yes (official) |
| VoxRider | **Spoken TTS voice** | **Yes** | Yes (BLE protocol) |

### Validated gap
Neither existing app offers voice alerts. User demand has been documented on Garmin forums since 2018. Key complaints: tones indistinguishable from music, tied to media volume, no contextual information, Android background instability.

### Distribution context
Garmin operates a formal Radar Data BLE Program requiring access approval. The community has reverse-engineered the Varia BLE protocol and it is publicly documented. VoxRider v1 distributes via sideload (Android APK, iOS personal dev cert) and open-source GitHub — avoiding App Store risk. Formal distribution is a post-v1 decision.

---

## 4. Target User

**Primary:** Solo road cyclists who:
- Ride with earbuds (music or podcasts)
- Own a Garmin Varia RTL515, RTL516, or RVR315
- Want hands-free, eyes-free situational awareness
- Current setup: Varia → Wahoo/Garmin head unit (visual) + phone for audio

**Secondary:** Hearing-impaired cyclists who cannot reliably hear standard beep alerts.

---

## 5. Product Goals

1. **Awareness without distraction** — rider gets full threat context without looking at a screen
2. **Dead simple setup** — any rider, any age, paired and riding in under 2 minutes
3. **Reliable for the full ride** — maintains BLE connection for 3+ hours, survives background, screen lock, phone calls
4. **Audio-first design** — audio warns, visual strip informs. Clear separation of concerns.
5. **No interference** — existing ANT+ pairings (Wahoo, Fenix) unaffected

---

## 6. Success Metrics

| Metric | Target |
|---|---|
| Alert latency | < 1 second from BLE notification to TTS playback |
| Alert clarity | Distinguishable at 20mph+ with wind noise and music playing |
| Battery impact | < 5% additional phone drain per hour |
| Background reliability | Maintains BLE connection for 3+ hours without dropping |
| ANT+ interference | Zero — Wahoo Bolt / Fenix 8 pairings unaffected |
| Pairing time | First-time pairing completed in under 2 minutes |

---

## 7. Technical Architecture

### BLE Protocol
The Garmin Varia RTL515 exposes a BLE GATT service that streams radar data continuously:

- **Service UUID:** `6A4E3200-667B-11E3-949A-0800200C9A66`
- **Characteristic UUID:** `6A4E3203-667B-11E3-949A-0800200C9A66`
- **Packet format:** `1 + (3 × n)` bytes, where `n` = threat count
  - Byte 0: `[sequence_id: 4 bits][threat_count: 4 bits]`
  - Per threat (bytes 1, 4, 7...):
    - Byte 0: speed (`uint8`, m/s)
    - Byte 1: distance (`uint8`, meters, max 255m)
    - Byte 2: flags — bits 7–6: threat level (`0`=none, `1`=medium, `2`=high, `3`=unknown)
- **Split packets:** Payloads exceeding the 20-byte BLE MTU are split. Fragments share a sequence ID (upper nibble of byte 0) and are reassembled by the client.
- **Update rate:** ~100–300ms when threats present. Continuous idle (1-byte) packets when clear.
- **Device name prefix:** `RTL` (e.g. `RTL64894`)

### Pairing behaviour
- **First-time:** Turn on Varia → device advertises BLE immediately — no special pairing mode required
- **Subsequent:** Powers on and advertises automatically — app auto-connects to remembered UUID
- **ANT+ unaffected:** Wahoo/Fenix pair via ANT+ (separate radio). BLE channel is exclusive to VoxRider.

### Connection strategy
```
Phone (BLE) ←→ Varia RTL515
Wahoo Bolt  (ANT+) ←→ Varia RTL515   [unaffected, separate radio]
Fenix 8     (ANT+) ←→ Varia RTL515   [unaffected, separate radio]
```

### System architecture
```
┌─────────────────────────────────────────────────────┐
│                    VoxRider App                      │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  UI Layer    │    │   Background Service      │   │
│  │              │    │  (Android Foreground /    │   │
│  │  MainScreen  │◄───│   iOS Background BLE)     │   │
│  │  RadarStrip  │    │                           │   │
│  │  Settings    │    │  ┌─────────────────────┐  │   │
│  └──────────────┘    │  │   BLE Manager       │  │   │
│                      │  │  (react-native-     │  │   │
│                      │  │   ble-plx)          │  │   │
│                      │  └────────┬────────────┘  │   │
│                      │           │               │   │
│                      │  ┌────────▼────────────┐  │   │
│                      │  │  Packet Parser      │  │   │
│                      │  │  (byte → threats)   │  │   │
│                      │  └────────┬────────────┘  │   │
│                      │           │               │   │
│                      │  ┌────────▼────────────┐  │   │
│                      │  │  Alert Engine       │  │   │
│                      │  │  (trigger logic,    │  │   │
│                      │  │   throttle,         │  │   │
│                      │  │   snapshot)         │  │   │
│                      │  └────────┬────────────┘  │   │
│                      │           │               │   │
│                      │  ┌────────▼────────────┐  │   │
│                      │  │  TTS Engine         │  │   │
│                      │  │  (react-native-tts, │  │   │
│                      │  │   audio ducking)    │  │   │
│                      │  └─────────────────────┘  │   │
│                      └──────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Tech stack

| Component | Library |
|---|---|
| Framework | React Native (cross-platform iOS + Android) |
| BLE | `react-native-ble-plx` |
| TTS + audio ducking | `react-native-tts` |
| iOS audio session | `AVAudioSession .duckOthers` |
| Android audio focus | `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` |
| Android background | Foreground Service with persistent notification |
| iOS background | Background BLE mode entitlement |
| Navigation | React Navigation (stack navigator) |
| State management | React Context / Zustand (TBD during implementation) |
| Storage | AsyncStorage (settings, paired devices) |

---

## 8. Feature Specification

### 8.1 Pairing & Connection

#### First-time pairing (REQ-CON-001)
2-step onboarding flow. Designed for all ages — no technical knowledge required.

The Varia advertises BLE continuously when powered on. No special pairing mode or button sequence needed — VoxRider connects without BLE bonding.

**Step 1 — Turn on your Varia**
- Illustration of Varia device
- Instruction: *"Turn on your Varia"*
- Step progress: 1 of 2
- "Search" button → proceeds to Step 2

**Step 2 — Select & Connect**
- App scans for BLE devices with `RTL` prefix
- Animated searching indicator
- Devices shown as "Varia Radar" (raw ID small underneath), listed by signal strength
- Single tap → connects immediately
- On success → main screen + TTS *"Radar connected"*
- 30s timeout with no devices → *"Varia not found — make sure it's turned on"* + "Try again" button

No BLE terminology, UUIDs, or Bluetooth pairing dialogs shown. All errors allow retry — no dead ends.

#### Subsequent rides (REQ-CON-002)
- Auto-connect to remembered device UUID on launch
- Silent connection + TTS *"Radar connected"* on success
- *"Searching for radar..."* status if not found within 30 seconds — not an error state

#### Reconnect reliability — safety critical (REQ-CON-003)
BLE drops must be recovered automatically and persistently for the full ride duration.

| Phase | Retry interval |
|---|---|
| First 60 seconds | Every 3 seconds |
| After 60 seconds | Every 10 seconds |
| Stop retrying | Never |

- TTS: *"Radar disconnected"* on drop
- TTS: *"Radar reconnected"* on recovery
- TTS: *"No radar signal"* on exponential backoff if disconnected > 30 seconds (T+30s, T+90s, T+390s, T+990s, T+1890s — then silent)
- Logic lives in background service layer, not UI
- Survives: screen lock, app backgrounding, phone calls, Android Doze, iOS background limits

#### Conflict warning (REQ-CON-004)
- Only one app can hold the Varia BLE channel at a time
- If connection fails repeatedly: *"Is another app connected to your Varia?"*
- Not shown upfront — only surfaced on failure

---

### 8.2 Visual Display

#### Radar sidebar strip (REQ-VIS-001)
Narrow vertical strip, full screen height. Updates directly from raw BLE packets (~200ms). No throttling on visual layer.

```
  [close] ─ top
      │
      │  ●  ← red icon (high speed, 40m)
      │
      │
      │  ●  ← orange icon (medium speed, 120m)
      │
  [far] ─ bottom
```

| State | Light mode | Dark mode | Icons |
|---|---|---|---|
| No threats | `#22C55E` (green) | `#16A34A` (green) | None |
| Medium speed | `#F97316` (orange) | `#EA6B0D` (orange) | Car icon at distance position |
| High speed | `#EF4444` (red) | `#DC2626` (red) | Car icon at distance position |
| Unknown level | `#F97316` (orange) | `#EA6B0D` (orange) | Car icon (conservative) |

Car icons: white (`#FFFFFF`) in both light and dark mode.

- Full 255m range displayed
- No numeric labels — position conveys distance
- Multiple vehicles: each at their own position, stacked if distances are very close
- Sidebar position: Left (default) or Right (user setting)

#### Main screen layout (REQ-VIS-003)
Single screen. Sidebar + main area.

```
┌──────────────────────────────┬───┐
│  ● Connected · Varia Radar   │   │
│                              │   │
│                              │ ↑ │
│         2 vehicles           │ ● │
│            40ft              │   │
│                              │ ● │
│      Varia battery ████░     │ ↑ │
│                              │   │
│        [ Test Alert ]        │   │
└──────────────────────────────┴───┘
```

- **Connection status** — top, always visible
- **Live threat state** — center, large: "Clear" (green) or vehicle count + closest distance
- **Varia battery** — subtle, below threat state
- **Test Alert** — bottom, fires a sample TTS to verify earbuds before riding
- **Settings** — swipe left gesture, no icon on screen

---

### 8.3 Audio Alerts

#### TTS precedence (REQ-AUD-001)
Alerts take precedence over all audio. Audio ducking applied to music, podcasts, navigation. App requests maximum audio priority — OS handles final mixing for phone calls (platform limitation).

#### Trigger conditions (REQ-AUD-002)
Alerts fire on meaningful state changes only:

| Trigger | Notes |
|---|---|
| New threat detected | First appearance of any vehicle |
| Threat count increases | Additional vehicle appears |
| Threat level escalates | Medium → High (bypasses 2s throttle — safety always wins) |
| All clear | Debounced 3 seconds to avoid false clears |

Minimum 2 second throttle between alerts, except escalation.

#### Snapshot-on-completion (REQ-AUD-003)
While TTS is speaking, incoming BLE updates are discarded (not queued). When TTS finishes, the app evaluates current live state and fires a new alert only if warranted. Rider always hears current information — never stale queued data.

Exception: medium → high escalation interrupts immediately.

#### Alert format (REQ-AUD-004)
Distance is never spoken. Controlled by verbosity setting.

| Verbosity | Example alert |
|---|---|
| Detailed (default) | *"2 vehicles, high speed"* / *"1 vehicle, medium speed"* |
| Balanced | *"2 vehicles"* / *"1 vehicle"* |
| Minimal | *"2 cars"* / *"car"* |

Clear announced as *"Clear"* across all verbosity levels — only spoken after a threat was active.

---

### 8.4 Settings (swipe left)

| Setting | Options | Default |
|---|---|---|
| Sidebar position | Left / Right | Left |
| Alert verbosity | Detailed / Balanced / Minimal | Detailed |
| Units | Imperial / Metric | Imperial |
| Alert volume | Fixed loud (no slider) | — |
| Paired devices | List, remove, add | — |

**Paired Devices:**
- Lists all paired Varia devices by friendly name + raw ID
- Remove: forgets device, disconnects if active
- Add Device: launches pairing flow (REQ-CON-001)
- If empty: shows "No devices paired" + Add Device button

---

### 8.5 Authentication

No authentication. VoxRider is entirely on-device. No server, no account, no data leaving the phone. Revisit if cloud features are added post-v1.

---

### 8.6 Permissions

**Android — BLE Permissions (REQ-PER-001)**
Android BLE permissions differ by API level — handled at runtime:

| Android version | Permissions required |
|---|---|
| Android 12+ (API 31+) | `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` |
| Android 11 and below (API ≤ 30) | `ACCESS_FINE_LOCATION` |

Pre-explanation shown before system dialog:
> *"VoxRider needs Bluetooth access to connect to your Varia radar. On older Android versions this also requires location permission — your location is never stored or shared."*

If denied: plain-language explanation with "Open Settings" button.

**iOS — Bluetooth**
Standard iOS Bluetooth permission dialog. Usage description: *"VoxRider uses Bluetooth to connect to your Garmin Varia radar."*

---

## 9. UX Flows

### First launch
```
App opens
  └─► No paired device found
        └─► Pairing onboarding (Step 1 → 2)
              └─► Main screen
```

### Subsequent rides
```
App opens
  └─► Auto-scan for remembered device
        ├─► Found → connect → TTS "Radar connected" → Main screen active
        └─► Not found → "Searching for radar..." → keep scanning
```

### Mid-ride BLE drop
```
Connection lost
  └─► TTS "Radar disconnected"
  └─► Retry every 3s (first 60s) → every 10s (after)
  └─► If > 30s disconnected → "No radar signal" backoff (T+30s, +60s, +300s, +600s, +900s → silent)
  └─► Reconnected → TTS "Radar reconnected" → resume normal operation
```

### Threat alert flow
```
BLE packet received (~200ms)
  └─► Parse threats
  └─► Update visual strip (immediate, always)
  └─► Evaluate alert triggers
        ├─► No trigger → discard
        ├─► Trigger + TTS idle → fire alert
        ├─► Trigger + TTS speaking + escalation → interrupt + fire
        └─► Trigger + TTS speaking + non-escalation → discard (snapshot on completion)
              └─► TTS finishes → evaluate current state → fire if warranted
```

---

## 10. Non-Goals (v1)

- No ride history logging (v1.1)
- No haptic patterns (v1.3)
- No Connect IQ companion (v2.0)
- No Strava integration
- No cloud sync or user accounts
- No App Store distribution (post-v1)
- No support for non-Varia radar devices
- No numeric speed readout in alerts

---

## 11. Roadmap

| Version | Features |
|---|---|
| **v1.0** | Core BLE → TTS pipeline, radar strip, pairing flow, settings |
| **v1.1** | Ride history logging (vehicle count, threat events as JSON/CSV per ride) |
| **v1.2** | Alert verbosity in settings (already in v1.0) |
| **v1.3** | Haptic patterns (Apple Watch / phone vibration matching threat level) |
| **v2.0** | Connect IQ companion — read radar via Fenix 8 CIQ → phone (alternative to direct BLE) |
| **Future** | Strava auto-upload of vehicle encounter data, App Store distribution |

---

## 12. Open Questions

- ~~Battery level characteristic UUID~~ — **Resolved:** Standard BLE Battery Service `0x180F` / Battery Level characteristic `0x2A19` (full UUID `00002a19-0000-1000-8000-00805f9b34fb`). Returns `uint8` 0–100 percentage. Supports notifications. Confidence: high (harbour-tacho BlueZ Battery1 confirms device implements standard service). **Verify with nRF Connect on physical device before shipping.**
- ~~State management library~~ — **Resolved:** Zustand. Two stores: `useRadarStore` (high-frequency BLE data — threats, connection status, battery level) and `useSettingsStore` (low-frequency persisted settings — sidebar position, verbosity, units, paired devices). Zustand's selector-based subscriptions prevent cascade re-renders from 100–300ms BLE updates. Pure JS, no native modules — works identically on Android and iOS.

## 13. Platform Minimums

| Platform | Minimum | Rationale |
|---|---|---|
| iOS | **15.0** | Covers ~95% of active iPhones. Simplifies AVAudioSession handling. Required by RN 0.73+. |
| Android | **API 26 (Android 8.0)** | Required for foreground service notification channels. Covers ~97% of active Android devices. |

## 14. UI Constraints

- **Orientation:** Portrait only. Locked in native config on both platforms.
- **Colour scheme:** Light and dark mode both supported. App follows system preference. Dark mode saves battery on OLED screens — important for a ride app.
- **App icon:** Required for device install. Created as part of M0 (TASK-003).
- **Splash screen:** Minimal — React Native default or solid colour. Not a design priority for v1.

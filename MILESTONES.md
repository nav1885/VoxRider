# VoxRider — Milestone & Task Breakdown

Each milestone delivers a working, tested vertical slice of the product. Each task includes design, implementation, testing, and documentation steps.

---

## Milestone 0 — Project Foundation
**Goal:** Runnable React Native app on iOS and Android with all dependencies installed and architecture scaffolded.

### Phase 0.1 — Scaffold

#### ✅ TASK-000: React Native project setup
- Init React Native project (TypeScript template)
- Configure for iOS and Android
- Verify hello-world runs on both simulators
- Verify Jest is configured (comes pre-installed with RN CLI)
- Install `@testing-library/react-native` + `@testing-library/jest-native`
- Add testing convention to project:
  - **Unit tests** (pure logic): Jest — `src/**/__tests__/*.test.ts`
  - **Component tests** (UI rendering): React Native Testing Library — `src/**/__tests__/*.test.tsx`
  - **Integration tests** (wired pipeline with mocks): Jest + MockBLEManager
  - **Manual tests** (physical hardware): documented checklists in `MILESTONES.md`
- **Test:** `yarn test` runs with no failures on a sample test file
- **Docs:** Create README with setup instructions, prerequisites, how to run, and how to run tests

#### ✅ TASK-001: Dependency installation & platform configuration
- Install `react-native-ble-plx` + native linking
- Install `react-native-tts` + native linking
- Install `@react-native-async-storage/async-storage`
- Install `zustand`
- Install `@react-navigation/native` + `@react-navigation/stack` + peer dependencies (`react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`)
- Set minimum iOS version to **15.0** in Xcode project settings and Podfile
- Set minimum Android SDK to **API 26** in `build.gradle` (`minSdkVersion 26`)
- Lock orientation to portrait only (iOS: `Info.plist` `UISupportedInterfaceOrientations`, Android: `AndroidManifest.xml` `screenOrientation="portrait"`)
- Configure light + dark mode support — app follows system preference (iOS: `UIUserInterfaceStyle` unset, Android: `DayNight` theme)
- Configure iOS `Info.plist` — Bluetooth usage description
- Configure Android `AndroidManifest.xml` — BLE permissions split by API level:
  - API < 31 (Android 11 and below): `ACCESS_FINE_LOCATION`
  - API 31+ (Android 12+): `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` + `ACCESS_FINE_LOCATION`
- Configure iOS background BLE mode entitlement
- Configure Android foreground service
- **Test:** No build errors on both platforms. Native modules resolve.
- **Docs:** Document all native configuration steps in README

#### ✅ TASK-002: Project architecture scaffold
- Define folder structure: `src/ble/`, `src/alerts/`, `src/ui/`, `src/settings/`, `src/services/`
- Define TypeScript interfaces: `Threat`, `RadarPacket`, `DeviceInfo`, `AlertSettings`
- Create `src/constants/strings.ts` — all user-facing strings in one file, no magic strings in components
- Pin React Native to latest stable version at project init — document pinned version in README, no auto-upgrades
- Create BLE abstraction interface `IBLEManager` with methods: `scan()`, `connect()`, `disconnect()`, `subscribe()`
- Create `MockBLEManager` implementing `IBLEManager` for testing
- Set up **Zustand** state management — two stores:
  - `useRadarStore`: `threats`, `connectionStatus`, `batteryLevel` (high-frequency BLE data)
  - `useSettingsStore`: `sidebarPosition`, `verbosity`, `units`, `pairedDevices` (persisted via AsyncStorage)
- Set up React Navigation stack with all screens registered:
  - `PairingStep1` → `PairingStep2` → `Main`
  - No back gesture on `Main` (`gestureEnabled: false`)
- **Test:** TypeScript compiles with no errors. Navigation between all screens works.
- **Docs:** Add `ARCHITECTURE.md` describing folder structure, data flow, navigation structure, key interfaces, and testing conventions (Jest for unit/integration, React Native Testing Library for components, manual checklists for hardware). Include demo mode instructions: hold Varia power button 6 seconds to simulate threats — used for hardware testing without riding.

#### TASK-003: App icon and splash screen
- Create app icon (1024×1024 source, React Native generates all required sizes)
- Export icon assets for iOS (`AppIcon` asset catalogue) and Android (`mipmap-*` folders)
- Splash screen: solid dark background with app name — minimal, not a design priority
- Verify icon appears correctly on iOS home screen and Android launcher
- **Test:** Install on both simulators → verify icon renders at all sizes
- **Docs:** Document icon source file location and export process

---

## Milestone 1 — BLE Core
**Goal:** App can scan for, connect to, and receive live data from a Garmin Varia (or mock). Packet parsing fully tested.

### Phase 1.1 — Packet Parser

#### ✅ TASK-010: BLE packet parser
- Implement `parseRadarPacket(bytes: Uint8Array): Threat[]`
- Handle 1-byte idle packet (zero threats)
- Decode per-threat: speed (raw `uint8` m/s), distance (raw `uint8` meters), threat level (bits 7–6 of flags byte) — parser outputs raw values only, unit conversion handled separately in `formatDistance()` / `formatSpeed()` utilities
- Handle split packets: detect shared sequence ID (upper nibble of byte 0), reassemble up to 15 threats. **Timeout: 500ms** — discard partial reassembly if second packet not received within 500ms
- **Test:** Unit tests covering:
  - Single threat packet
  - Multi-threat packet (up to 6)
  - Split packet (>6 threats, shared sequence ID)
  - Idle/clear packet (1 byte)
  - Edge cases: max distance (255m), max speed, all threat levels
- **Docs:** Inline documentation of byte format with reference to community spec

#### ⏳ TASK-011: Battery level characteristic (needs native — Xcode/Android Studio)
- **UUID resolved:** Standard BLE Battery Service `0x180F` / Battery Level characteristic `0x2A19` (full UUID `00002a19-0000-1000-8000-00805f9b34fb`). Format: `uint8`, 0–100 percentage. Supports notifications.
- Subscribe to battery characteristic notifications; also read on connect for immediate value
- If characteristic is absent or read fails: return `null` — UI hides battery bar (REQ-VIS-004)
- **Verify with nRF Connect GATT scan on physical device before shipping**
- **Test:** Unit test with known byte values (0, 50, 100); test null path (characteristic absent)
- **Docs:** Document characteristic UUID, format, and null-hide behavior

### Phase 1.2 — BLE Manager

#### ✅ TASK-012: BLE scan (RealBLEManager.scan() written; needs native to run)
- Implement `RealBLEManager.scan()` using `react-native-ble-plx`
- Filter for devices with `RTL` name prefix
- Return discovered devices with name + RSSI (signal strength)
- Handle scan timeout (30 seconds — timer starts when scan begins, not when first device appears)
- Handle Bluetooth off state
- **Test:** Integration test with `MockBLEManager` emitting fake device advertisements
- **Docs:** Document scan behaviour, timeout, and RTL filter

#### ✅ TASK-013: BLE connect + subscribe (RealBLEManager.connect() written; needs native to run)
- Implement `RealBLEManager.connect(deviceId)` 
- Subscribe to radar characteristic notifications
- On notification: call `parseRadarPacket()` → emit `Threat[]` to subscribers
- Handle connection errors gracefully
- **BLE service not found:** if radar service UUID absent after connect, treat as connection failure — increment failure count toward conflict hint (REQ-CON-004), retry via reconnect logic
- **Force-quit / app restart:** treat as fresh launch — auto-connect from AsyncStorage, no special handling needed
- **Test:** Integration test with `MockBLEManager` — emit packets, verify parsed output
- **Docs:** Document connection flow, notification subscription, and error handling

#### ✅ TASK-014: Reconnect logic (written in RealBLEManager; needs native to run)
- Implement reconnect loop: retry every 3s for 60s, then every 10s, never stop
- Distinguish between "device not found" vs "connection refused"
- Persist last connected device UUID via AsyncStorage
- On Bluetooth toggle off/on: detect state change → restart scan
- **Test:**
  - Simulate disconnect → verify retry fires at correct intervals
  - Simulate BT toggle → verify recovery
  - Simulate device not found for 2 minutes → verify retries continue
- **Docs:** Document reconnect strategy and all failure scenarios covered

### Phase 1.3 — Background Service

#### ⏳ TASK-015: Android foreground service + battery optimization (needs native)
- Implement Android foreground service wrapping BLE manager
- Persistent notification: "VoxRider active" (IMPORTANCE_LOW — visible but not intrusive)
- Declare `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` in manifest (required Android 14+)
- Declare `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission in manifest
- After first-time pairing completes: trigger `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` system dialog
- On every app launch: check `PowerManager.isIgnoringBatteryOptimizations()`
  - If not exempt: show persistent banner *"Battery restriction detected — radar may disconnect during rides"* with "Fix this" button
  - "Fix this" deep-links to battery settings using OEM-specific intents:
    - Samsung: `com.samsung.android.lool`
    - Xiaomi: `com.miui.powerkeeper`
    - Huawei: `com.huawei.systemmanager`
    - All others: standard `Settings.ACTION_APPLICATION_DETAILS_SETTINGS`
- Service survives: screen lock, app kill, stock Android Doze, OEM battery killers
- **Test:**
  - Lock screen with demo mode active → verify BLE notifications continue
  - Revoke battery exemption manually → verify banner appears on next launch
  - Tap "Fix this" on Samsung device → verify Samsung Device Care opens
  - Tap "Fix this" on non-Samsung device → verify standard Settings opens
  - Grant exemption → verify banner disappears
- **Docs:** Document service lifecycle, manifest config, OEM deep-link strategy

#### ⏳ TASK-016: iOS background BLE (needs native)
- Configure `UIBackgroundModes: bluetooth-central` in `Info.plist`
- Verify `CBCentralManager` background scanning with specific service UUID
- **Test:** Background app → lock screen → verify BLE notifications continue
- **Docs:** Document iOS background BLE limitations and entitlement setup

---

## Milestone 2 — Audio Pipeline
**Goal:** TTS alerts fire correctly for all trigger conditions, with proper throttling, snapshot logic, and audio ducking.

### Phase 2.1 — Alert Engine

#### ✅ TASK-020: Alert trigger logic
- Implement `AlertEngine.evaluate(prev: Threat[], next: Threat[], connectionStatus: ConnectionStatus): AlertTrigger | null`
- **Connection gate:** Return `null` immediately if `connectionStatus !== 'connected'`
- Triggers (the only three): vehicle count increases, max threat level escalates (medium → high), all-clear
- Not a trigger: de-escalation, count decrease (partial), distance change, same state repeating
- **Threat priority rule:** `maxLevel` = highest `ThreatLevel` across all current threats. `Unknown` treated as `Medium` (orange, conservative). So "2 vehicles, high speed" means ≥1 is high — not an average.
- **`ThreatLevel` enum:** `None = 0`, `Medium = 1`, `High = 2`, `Unknown = 3` (rendered as Medium)
- **`ConnectionStatus` enum:** `disconnected | scanning | connecting | connected | reconnecting`
- Track `lastSpokenState: { count: number, maxLevel: ThreatLevel }` — compared against current state on every evaluation
- 2-second throttle on non-escalation alerts
- Escalation bypasses throttle and interrupts immediately
- Clear debounce: 3-second timer reset on any threat re-appearance
- **Test:** Unit tests:
  - Zero → one threat → alert fires
  - One → two threats → alert fires
  - Two → one threat → no alert (count decreased, not zero)
  - Medium → high escalation → alert fires, interrupts
  - High → medium de-escalation → no alert
  - Threats → clear (with debounce) → alert fires after 3s
  - Threats → clear → re-appear within 3s → clear debounce resets, no clear alert
  - Same state repeated → no alert
  - BLE packet arrives while `connectionStatus !== 'connected'` → no alert

#### ✅ TASK-021: Snapshot-on-completion + watchdog timer
- Implement TTS queue: single-slot, not a queue — "pending" state only
- While speaking: discard incoming BLE updates — no queue
- On TTS finish: compare current state against `lastSpokenState` → fire only if count increased or max level escalated since last alert
- Escalation (medium → high): interrupt current TTS immediately, fire new alert
- **Watchdog timer:** on every `TTS.speak()` call, start a 10-second timer
  - `onFinished` fires → cancel timer, proceed normally
  - Timer fires first → log warning, force-reset speaking state, re-evaluate
- **Audio focus loss (Android):** listen for `AUDIOFOCUS_LOSS` events → treat as implicit speech end, reset state
- **Test:**
  - Trigger fires while speaking → no interrupt, flag set
  - TTS finishes → state unchanged since last alert → no follow-up alert
  - TTS finishes → more cars appeared while speaking → alert fires
  - TTS finishes → state de-escalated while speaking → no alert
  - Escalation mid-speech → immediate interrupt
  - State clears while speaking → no alert after finish (count = 0, clear debounce handles it)
  - Simulate `onFinished` never firing → watchdog fires at 10s, state resets, next alert works
  - Simulate audio focus loss mid-speech → state resets, next alert works

#### ✅ TASK-022: Alert message builder
- Implement `buildAlertMessage(threats: Threat[], verbosity: VerbositySetting): string`
- Detailed: `"2 vehicles, high speed"` / `"1 vehicle, medium speed"`
- Balanced: `"2 vehicles"` / `"1 vehicle"`
- Minimal: `"2 cars"` / `"car"`
- Clear: `"Clear"` (all verbosity levels)
- Singular/plural handling: "1 vehicle" not "1 vehicles"
- **Test:** Unit tests for all verbosity levels, all threat counts, clear message

### Phase 2.2 — TTS Integration

#### ✅ TASK-023: TTS engine
- Implement `TTSEngine` wrapping `react-native-tts`
- `speak(message: string, interrupt: boolean)`: speak message, interrupting if flagged
- Audio ducking: iOS `AVAudioSession .duckOthers`, Android `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`
- Volume: maximum, independent from media volume
- On TTS finish: emit `onFinished` event → alert engine re-evaluates
- Start 10-second watchdog timer on every `speak()` call (see TASK-021)
- On Android `AUDIOFOCUS_LOSS`: emit `onFinished` to reset state
- **Test:**
  - Verify audio ducking activates before speech and releases after
  - Verify interrupt works (second call cancels first)
  - Verify `onFinished` fires after normal speech completion
  - Verify watchdog fires and resets state if `onFinished` is suppressed (mock by removing listener)
  - Verify audio focus loss triggers state reset on Android
- **Docs:** Document iOS and Android audio session configuration, watchdog rationale

#### ✅ TASK-024: End-to-end alert pipeline test
- Wire `MockBLEManager` → `PacketParser` → `AlertEngine` → `TTSEngine` (mocked TTS output)
- Simulate full ride scenario: vehicle appears, approaches, speeds up, clears
- Verify correct alerts fire in correct order with correct messages
- **Test:** Integration test with scripted BLE packet sequence
- **Docs:** Document the full data flow from BLE packet to TTS output

---

## Milestone 3 — Visual Display
**Goal:** Radar sidebar strip renders correctly, updates at BLE rate, and the main screen layout is complete.

### Phase 3.1 — Radar Strip Component

#### ✅ TASK-030: RadarStrip component
- Implement `<RadarStrip threats={Threat[]} position="left|right" />`
- Vertical strip, full screen height
- Map threat distance (0–255m) to vertical position — far=bottom, close=top
- Car icon at each threat's distance position, stacked vertically one behind another (Wahoo-style) — no side-by-side layout, no threshold logic
- Strip background colors (follows system color scheme):
  - Clear: light `#22C55E` / dark `#16A34A`
  - Medium speed: light `#F97316` / dark `#EA6B0D`
  - High speed: light `#EF4444` / dark `#DC2626`
  - Unknown level: orange (same as medium, conservative)
- Car icons: white `#FFFFFF` in both modes
- Updates at BLE rate (~200ms) — no throttling
- **Test:**
  - Render with zero threats → green strip, no icons
  - Render with one threat at 50m → icon at correct position, orange background
  - Render with one threat at 50m, high speed → red background
  - Render with three threats at different distances → icons at correct vertical positions, stacked closest-to-top
  - Animated re-render: verify icons move toward top as distance decreases
- **Docs:** Document component props and position-mapping algorithm

#### ✅ TASK-031: Car icon asset
- Create or source minimal car icon (SVG preferred, ~28px)
- Ensure legibility on orange and red backgrounds
- **Test:** Visual review at multiple screen densities (1x, 2x, 3x)

### Phase 3.2 — Main Screen

#### ✅ TASK-032: Main screen layout
- Implement single-screen layout with sidebar + main area
- Connection status: dot indicator + device name or "Searching..."
- Live threat state: large centered text — "Clear" or "N vehicles · Xft"
- Varia battery: progress bar, below threat state
- Test Alert button: bottom center
- Units applied: imperial (ft) or metric (m) based on setting
- Sidebar docked left or right based on setting
- **Test:**
  - Render connected state → verify status text
  - Render disconnected state → verify "Searching..." and dimmed threat area
  - Render 2 threats, closest at 40ft → verify center text
  - Render clear → verify green "Clear" text
  - Toggle sidebar position setting → verify sidebar moves
  - Toggle units setting → verify distance display changes

#### ✅ TASK-033: Settings panel (swipe left)
- Implement swipe-left gesture on main screen → slide-in settings panel
- Settings panel contains: sidebar position, alert verbosity, units, paired devices
- Smooth slide animation
- Swipe right or tap outside to dismiss
- **Dependency note:** Settings persistence (AsyncStorage via `SettingsStore`) is implemented in TASK-050 (M5). In M3, wire settings controls to a stub store that holds values in memory only. Full persistence is completed when TASK-050 is done.
- **Test:**
  - Swipe gesture opens settings panel
  - Settings controls render correctly
  - Changes apply immediately to UI (sidebar moves, verbosity updates)
  - Swipe back closes panel
  - Full persistence tested in TASK-050

---

## Milestone 4 — Pairing UX
**Goal:** Complete first-time pairing flow and all connection state screens working end-to-end.

### Phase 4.1 — Pairing Flow

#### ✅ TASK-040: Pairing screen — Step 1 (Turn on Varia)
- Illustrated screen with Varia diagram
- Instruction text: *"Turn on your Varia"*
- Step indicator: 1 of 2
- "Search" button → Step 2
- **Test:** Render, button tap navigates to Step 2

#### ✅ TASK-041: Pairing screen — Step 2 (Select & Connect)
- Scanning animation + "Searching for your Varia..." text
- Step indicator: 2 of 2
- Calls `BLEManager.scan()` on mount
- Device list: "Varia Radar" + raw ID underneath, sorted by RSSI (strongest first)
- Single tap on device → calls `BLEManager.connect()`
- On success: save device to AsyncStorage → navigate to main screen + TTS "Radar connected"
- On failure (connect error): show inline error, offer retry
- 30s scan timeout with no devices found: show *"Varia not found — make sure it's turned on"* + "Try again" button (restarts scan, stays on Step 2)
- Bluetooth permission request (iOS + Android) triggered on entering this screen
- **Test:**
  - `MockBLEManager` emits one device → device appears in list
  - `MockBLEManager` emits two devices → both listed, stronger signal first
  - Tap device → connect called → success → navigates to main screen
  - Tap device → connect called → failure → inline error shown, device stays in list, tap retries in place
  - Device disappears from scan list after connect attempt → rescan automatically, stay on Step 2
  - 30s timeout with no devices → error message shown, "Try again" restarts scan

#### ✅ TASK-043: Android permissions flow
Request the correct BLE permissions based on Android API level at runtime.

- **Android 12+ (API 31+):** Request `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`
- **Android 11 and below:** Request `ACCESS_FINE_LOCATION`
- Show plain-language pre-explanation before system dialog:
  *"VoxRider needs Bluetooth access to connect to your Varia radar. On older Android versions this also requires location permission — your location is never stored or shared."*
- If any permission denied: plain-language explanation + "Open Settings" button
- If permanently denied: direct user to app Settings page
- **Test:**
  - Android 12+ device: `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` requested (not location)
  - Android 11 device: `ACCESS_FINE_LOCATION` requested
  - All granted → scan proceeds
  - Any denied → explanation + Settings link shown

### Phase 4.2 — Connection States

#### ✅ TASK-044: App launch routing
- On launch: check AsyncStorage for paired devices
- If none → pairing onboarding (Step 1)
- If one or more → go to main screen and attempt auto-connect:
  1. Try most recently connected device first
  2. If not found within 30 seconds → scan for any other paired devices → connect to **closest (strongest RSSI)**
  3. If still nothing found → stay on main screen with "Searching..." status
- Store `lastConnectedAt` timestamp per device in AsyncStorage to determine priority
- **Test:**
  - No paired devices → onboarding shown
  - One paired device → main screen, connection attempt starts
  - Two paired devices, most recent in range → connects to most recent
  - Two paired devices, most recent out of range → falls back to closest other device within 30s
  - Two fallback devices found simultaneously → connects to stronger RSSI
  - No paired devices in range → "Searching..." shown indefinitely

#### ✅ TASK-045: Disconnect + reconnect UX
- Visual: connection status updates in real time
- TTS: *"Radar disconnected"* on drop
- TTS: *"Radar reconnected"* on recovery
- TTS: *"No radar signal"* on exponential backoff if disconnected > 30 seconds:
  - T+30s → first announcement
  - T+90s → second (+60s)
  - T+390s → third (+300s)
  - T+990s → fourth (+600s)
  - T+1890s → fifth and final (+900s) — silent thereafter
  - Stops immediately on reconnect
- "Searching..." status shown while disconnected
- **Test:**
  - Simulate disconnect → status changes, TTS fires "Radar disconnected"
  - Simulate 35s disconnected → "No radar signal" fires (first)
  - Simulate 95s disconnected → second "No radar signal" fires (+60s)
  - Simulate 395s disconnected → third fires (+300s)
  - Simulate reconnect at any point → "Radar reconnected" fires, backoff timer resets
  - Simulate >1890s disconnected → no further announcements after fifth

---

## Milestone 5 — Settings & Polish
**Goal:** All settings functional, paired devices management complete, edge cases handled.

### Phase 5.1 — Settings Implementation

#### ✅ TASK-050: Settings persistence
- Implement `SettingsStore` using AsyncStorage
- Load settings on app launch
- Persist on every change
- Default values: sidebar=left, verbosity=detailed, units=imperial
- **Test:** Change setting → kill app → relaunch → verify setting persists

#### ✅ TASK-051: Paired devices management
- List view of all paired devices (name + raw ID)
- Remove device: confirm dialog → delete from AsyncStorage → disconnect if active → return to searching
- Add Device: launch pairing flow
- Empty state: "No devices paired" + Add Device button
- **Test:**
  - Remove active device → disconnects + searching state
  - Remove non-active device → list updates, no disconnect
  - Add device → completes pairing → appears in list

#### ✅ TASK-052: Units conversion
- Implement `formatDistance(meters: number, units: 'imperial' | 'metric'): string`
- Imperial: meters → feet (round to nearest 10ft for readability)
- Metric: pass through in meters
- Apply throughout: main screen threat display
- **Test:** Unit tests for conversion at 25m, 50m, 100m, 255m in both modes

### Phase 5.2 — Polish

#### ✅ TASK-053: Test Alert button
- Tapping Test Alert fires TTS with a sample alert using current verbosity setting
- Example: *"Test — 1 vehicle, high speed"*
- Disabled if radar not connected
- **Test:** Tap button → TTS fires with correct verbosity format

#### ✅ TASK-054: Conflict detection hint
- Track consecutive connection failure count (reset to 0 on any success)
- After 3+ consecutive failures: render inline banner below connection status line — *"Is another app connected to your Varia?"*
- Banner has a manual dismiss (✕) — hides until next failure cycle
- Banner auto-dismisses on next successful connection
- **Test:**
  - 2 failures → no banner
  - 3rd failure → banner appears below connection status
  - Successful connect → banner dismisses
  - Manual dismiss → banner hidden; 3 more failures → banner reappears

#### ⏳ TASK-055: Varia battery display (UI built, BLE wiring needs native)
- Parse battery level from BLE (characteristic UUID confirmed in TASK-011: `0x2A19`)
- Display as progress bar on main screen
- State: `batteryLevel: number | null` in `useRadarStore` — `null` = never received
- On transient read failure mid-ride: hold last known value (keep existing `batteryLevel`)
- Hide bar entirely only if `batteryLevel === null` (characteristic never returned data this session)
- No alert for low battery in v1 (visual only)
- **Test:**
  - Battery reads 100%, 50%, 20% → bar renders correctly
  - Battery at 10% → bar turns red
  - Battery at 11% → bar default color
  - Battery read succeeds then subsequent read fails → bar holds last value
  - Battery characteristic absent → bar hidden
  - Battery characteristic absent then succeeds mid-session → bar appears

---

## Milestone 6 — Reliability & Release
**Goal:** App is stable for 3+ hour rides. All known failure scenarios tested. Build ready for distribution.

### Phase 6.1 — Reliability Testing

#### TASK-060: Background reliability + battery drain testing
- Physical device test: run app, lock screen, ride for 30+ minutes
- Verify BLE notifications continue through lock screen (iOS + Android)
- Verify TTS alerts fire through earbuds during lock screen
- Verify Android foreground service survives stock Doze mode
- **OEM-specific testing** — test on at least one Samsung device (most common Android OEM):
  - With battery optimization exemption granted → verify BLE survives 30min background
  - With battery optimization exemption revoked → verify banner appears and "Fix this" works
- **Battery drain:** measure phone battery % before and after 1-hour ride. Target: <5% additional drain vs baseline (phone idle, BT on, no VoxRider)
- **Test:** Manual checklist — document results per device model + OS version

#### TASK-061: Reconnect scenario testing
- Power cycle Varia mid-ride → verify auto-reconnect
- Walk Varia out of range → walk back → verify reconnect
- Toggle Bluetooth off/on → verify reconnect
- Kill app and relaunch → verify auto-connect
- **Test:** Manual test checklist with physical hardware

#### TASK-062: Multi-threat stress test
- Use Varia demo mode (hold power 6 seconds) to simulate threat sequences
- Verify strip renders correctly for all demo scenarios
- Verify TTS alerts fire correctly for demo scenarios
- Verify no crashes or memory leaks over 30 minutes of demo mode
- **Test:** Manual test with device

#### TASK-063: Performance validation
- Measure alert latency: BLE notification → TTS start (target: < 1 second)
- Measure battery drain: baseline vs app running (target: < 5% per hour)
- Profile React Native render loop for strip updates
- **Test:** Profiling session with results documented

### Phase 6.2 — Distribution

#### TASK-064: Android APK build
- Configure release build signing
- Build release APK
- Install and smoke-test on physical Android device
- **Docs:** Document APK build + install instructions in README

#### TASK-065: iOS build (personal dev cert)
- Configure development signing
- Build and deploy to personal device via Xcode
- Smoke-test on physical iOS device
- **Docs:** Document iOS build instructions in README

#### TASK-066: GitHub release
- Tag v1.0
- Write release notes
- Attach Android APK to release
- **Docs:** Update README with download link and install instructions

---

## Documentation Checkpoints

At the end of each milestone, verify:
- [ ] `README.md` — setup, build, and run instructions are current
- [ ] `ARCHITECTURE.md` — reflects any structural changes
- [ ] `SPEC.md` — open questions resolved, non-goals updated if scope changed
- [ ] `REQUIREMENTS.md` — acceptance criteria marked as met
- [ ] Inline code comments — all public interfaces and non-obvious logic documented
- [ ] `CHANGELOG.md` — milestone summary added

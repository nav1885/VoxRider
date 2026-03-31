# VoxRider — Requirements

## Pairing & Connection

### REQ-CON-001: First-Time Pairing Flow
On first launch (no remembered device), the app guides the user through a 2-step onboarding flow. Designed for all ages — must be followable without any technical knowledge.

The Varia advertises BLE continuously when powered on. No special pairing mode or button sequence is required — VoxRider connects without BLE bonding.

**Step 1 — Turn on your Varia**
- Illustrated diagram of the Varia device
- Single instruction: "Turn on your Varia"
- Step progress indicator: Step 1 of 2
- "Search" button to begin scanning

**Step 2 — Select your Varia**
- App scans for BLE devices matching the `RTL` prefix
- Animated "Searching for your Varia..." indicator
- Step progress indicator: Step 2 of 2
- Device displayed as "Varia Radar" (raw ID shown small underneath for reference)
- If multiple devices found: listed by signal strength, strongest first — single tap to select
- On success: transitions to main screen with TTS "Radar connected"
- On connect failure: show inline error *"Couldn't connect — tap to try again"* — stay on Step 2, device remains in list
- If device disappears from scan list: rescan automatically, stay on Step 2
- If nothing found after 30 seconds: shows "Varia not found — make sure it's turned on" with a "Try again" button (restarts scan)

**Acceptance criteria:**
- No technical terms (no BLE, UUID, Bluetooth pairing dialogs) shown to user
- All error states allow retry with a plain-language explanation — no dead ends
- Conflict warning ("Is another app connected to your Varia?") appears only if connection repeatedly fails — not shown upfront

### REQ-CON-002: Subsequent Ride Auto-Connect
After initial pairing, the app auto-connects to the remembered device on launch with no user interaction required.

**Auto-connect priority (multiple paired devices):**
1. Attempt to connect to the **most recently connected** device first
2. If not found within 30 seconds, scan for any other paired devices — connect to the **closest one** (strongest RSSI)
3. If no paired device found, show "Searching for radar..." — keep scanning

**Acceptance criteria:**
- No pairing steps shown on subsequent launches
- App connects silently and announces "Radar connected" via TTS when link is established
- If most recently used device not found within 30 seconds, automatically connects to closest other paired device
- If no paired device found at all, shows "Searching for radar..." — not an error state

### REQ-CON-002a: Android Battery Optimization Exemption
The app must actively ensure it is exempt from Android battery optimization to guarantee background BLE reliability.

**Acceptance criteria:**
- After first-time pairing completes, prompt user via system dialog (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) to exempt VoxRider
- On every launch, check `PowerManager.isIgnoringBatteryOptimizations()` — if not exempt, show a persistent banner: *"Battery restriction detected — radar may disconnect during rides"* with a "Fix this" button
- "Fix this" button deep-links directly to the battery settings screen, using OEM-specific intents where available (Samsung, Xiaomi, Huawei) and the standard Settings fallback for all others
- Manifest declares `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission
- Foreground service declares `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` (required Android 14+)

### REQ-CON-003: Reconnect Reliability (Safety Critical)
If the BLE connection drops at any point during a ride, the app must immediately and persistently attempt to reconnect without user intervention.

**Acceptance criteria:**
- Reconnect retries every 3 seconds for the first 60 seconds after drop
- Retries every 10 seconds thereafter — never stops trying
- TTS announces "Radar disconnected" on drop and "Radar reconnected" on recovery
- If disconnected for >30 seconds, TTS announces "No radar signal" on an exponential backoff schedule, then stops:
  - T+30s → first announcement
  - T+90s (30+60) → second
  - T+390s (30+60+300) → third
  - T+990s (30+60+300+600) → fourth
  - T+1890s (30+60+300+600+900) → fifth and final — silent thereafter
- Announcements stop immediately on reconnect
- Reconnect logic runs in a persistent background service (Android foreground service / iOS background BLE mode) — survives screen lock, app backgrounding, and phone calls
- BLE connection managed by the service layer, not the UI layer

### REQ-CON-004: Conflict Warning
The Garmin Varia app (and any other BLE app) will block VoxRider from connecting as only one BLE client can hold the connection at a time.

**Acceptance criteria:**
- Onboarding instructs user to close the Garmin Varia app
- After 3+ consecutive failed connection attempts: show an inline banner directly below the connection status line — *"Is another app connected to your Varia?"*
- Banner is non-blocking — rider can dismiss it manually
- Banner auto-dismisses on next successful connection
- Not shown upfront — only surfaced after repeated failures

---

## Visual Display

### REQ-VIS-001: Radar Sidebar Strip
A narrow vertical sidebar runs the full screen height displaying approaching vehicles in real-time, updated directly from raw BLE packets (~100–300ms). No throttling on the visual layer.

- **Orientation:** Far = bottom, close = top. Rider implied at top.
- **Vehicle markers:** Small car icons sequenced at their actual distance position on the strip
- **Strip background color:**
  - Green — no threats
  - Orange — medium speed threat
  - Red — high speed threat (highest danger)
  - Orange — unknown threat level (conservative default)
- **Range:** Full 255m range displayed
- **Labels:** No numeric distance labels — position conveys distance
- **Clear state:** Solid green strip, no icons
- **Multiple vehicles:** Each icon positioned at its own distance on the strip, stacked vertically — closest at top, furthest at bottom. Icons naturally follow one behind another (Wahoo-style). No side-by-side layout.

### REQ-VIS-002: Sidebar Position Setting
The sidebar position is user-configurable via Settings.

- **Default:** Left side
- **Options:** Left / Right
- **Stored:** Persists across app restarts

### REQ-VIS-003: Main Screen Layout
Single screen. Sidebar on left (default) or right. Main area shows live state — not historical.

**Main area content:**
- **Top:** Connection status — "● Connected / Varia RTL64894" or "Searching..."
- **Center (large, prominent):** Current threat state, updated live:
  - No threats → "Clear" (green)
  - Threats present → vehicle count + closest distance e.g. "2 vehicles · 40m"
- **Below center:** Varia battery level
- **Bottom:** Test Alert button

**Settings access:** Swipe left on the main screen — no settings icon or button on screen.

---

## Settings

### REQ-SET-001: Sidebar Position
- Default: Left
- Options: Left / Right
- Accessed via swipe left on main screen

### REQ-SET-002: Alert Verbosity
Controls how much detail is spoken in TTS alerts. Distance is never spoken — audio warns, the visual strip informs.
- **Default: Detailed** — "2 vehicles, high speed" / "1 vehicle, medium speed"
- **Balanced** — "2 vehicles" / "1 vehicle"
- **Minimal** — "car" / "2 cars"

### REQ-SET-003: Units
Controls distance units across the app (main screen threat display, any distance references).
- **Default: Imperial** — feet / miles
- **Option: Metric** — meters / kilometers
- **Display format:** No space between value and unit — "40ft", "120m", "0.3mi", "0.5km"

### REQ-SET-004: Alert Volume
TTS alert volume is fixed at a loud default. No user-adjustable volume slider — alerts are always prominent.
- Uses independent audio channel from media volume (fixes the Garmin app's #1 complaint)

### REQ-SET-005: Paired Devices
Manages the list of known Varia devices.

- Lists all previously paired devices by friendly name ("Varia Radar") with raw ID shown small underneath
- Each device has a **Remove** option — removes from memory, app will no longer auto-connect to it
- If no devices are paired: shows "No devices paired" with an **Add Device** button that launches the REQ-CON-001 pairing flow
- **Add Device** button always visible at the bottom of the list (to support multiple Varias)
- Removing the currently active device disconnects immediately and returns app to searching state

---

## Audio Alerts

### REQ-AUD-001: TTS Alert Precedence
TTS alerts take precedence over all other audio. No suppression under any circumstance.

- Audio ducking applied to music, podcasts, navigation, and phone calls — VoxRider alert speaks over everything
- **Note:** iOS and Android may limit ducking of active phone call audio at the OS level. App requests maximum audio priority; OS handles final mixing. This is a platform constraint, not a design choice.

### REQ-AUD-002: Alert Trigger Conditions
Alerts fire only when something materially changes that the rider needs to know. No back-to-back or redundant alerts.

- **Connection gate:** Alerts only fire when `connectionStatus === 'connected'`. No alerts during "Searching...", reconnecting, or any transitional state — even if a BLE packet arrives.
- **Trigger conditions (the only three):**
  1. **Vehicle count increases** — one or more new cars appear (includes first appearance)
  2. **Max threat level escalates** — medium → high speed
  3. **All clear** — all vehicles drop to zero, debounced 3 seconds to avoid false clears. **Cap: 5 seconds** — if threats haven't reappeared within 5 seconds, force clear regardless
- **Not a trigger:** de-escalation (high → medium), count decreases (partial), distance changes, same state repeating
- Escalation (medium → high) **immediately interrupts** any currently speaking alert — safety always wins
- All other alerts respect a 2-second minimum throttle

### REQ-AUD-003: Snapshot-on-Completion
While TTS is speaking, incoming BLE updates are not queued. When TTS finishes, the app compares current live state against **last spoken state** and fires a new alert only if something materially changed:
- Current vehicle count > last spoken count, OR
- Current max threat level > last spoken max level

If state is the same or has only de-escalated/decreased, no follow-up alert fires. This prevents back-to-back identical alerts and ensures the rider always hears current, non-redundant information.

- **Last spoken state** is tracked as `{ count: number, maxLevel: ThreatLevel }` — reset to zero/none on all-clear
- Exception: medium → high escalation interrupts immediately regardless (REQ-AUD-002)

**Watchdog timer (reliability requirement):**
`onFinished` from `react-native-tts` is not guaranteed to fire on all Android versions and conditions. A 10-second watchdog timer must run alongside every TTS utterance:
- If `onFinished` fires within 10 seconds → cancel timer, proceed normally
- If timer fires first → force-reset TTS speaking state, re-evaluate current threat state
- On Android audio focus loss → treat as implicit speech end, reset state immediately
- Ensures the app never gets permanently stuck in "TTS speaking" state with alerts silently dropped

### REQ-AUD-004: Alert Format
Distance is never spoken. Audio warns — the visual strip informs.
Alert format controlled by REQ-SET-002 (verbosity setting).

- **Detailed (default):** "2 vehicles, high speed" / "1 vehicle, medium speed" / "Clear"
- **Balanced:** "2 vehicles" / "1 vehicle" / "Clear"
- **Minimal:** "2 cars" / "car" / "Clear"

---

## Authentication

### REQ-AUTH-001: No Authentication Required
VoxRider is entirely self-contained. All processing happens on-device — BLE connection, TTS playback, settings, and ride logging (v1.1). There is no server, no cloud sync, and no data leaving the phone.

- No user registration or login for v1
- No account required to use any feature
- Revisit if cloud features (settings sync, ride history upload, Strava integration) are added in a future version

---

## Permissions

### REQ-PER-001: Android BLE Permissions
Android BLE permissions differ by API level and must be handled at runtime:

- **Android 12+ (API 31+):** Request `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`. Location permission not required for BLE on these versions.
- **Android 11 and below (API ≤ 30):** Request `ACCESS_FINE_LOCATION`. Required by Android for BLE scanning on older versions.

Pre-explanation shown before system dialog: *"VoxRider needs Bluetooth access to connect to your Varia radar. On older Android versions this also requires location permission — your location is never stored or shared."*

- If denied: plain-language explanation with "Open Settings" button
- If permanently denied: direct user to app Settings page
- **If permission revoked mid-session:** show persistent banner *"Bluetooth permission required"* + "Open Settings" button — same flow as initial denial

---

### REQ-VIS-004: Varia Battery Display
Battery level shown as a progress bar on the main screen, sourced from BLE battery characteristic.
- If battery data is available: show progress bar with percentage
- If battery characteristic UUID cannot be confirmed on connect: **hide the battery bar entirely** — do not show a placeholder or zero value that could mislead the rider
- If a transient BLE read failure occurs mid-ride: **hold the last known value** — do not hide the bar
- Only hide the bar if no battery reading has ever been received in the current session
- Bar color: red when battery ≤ 10%, default (system foreground) otherwise
- No low-battery voice alert in v1 (visual indicator only)

---

## To Be Defined
- Settings screen design (full list of items + layout)
- Background service behavior (Android / iOS specifics)
- Ride logging (v1.1+)

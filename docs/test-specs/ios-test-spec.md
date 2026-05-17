# VoxRider iOS Test Specification

**Version:** 1.0  
**Platform:** iOS 15.0+  
**React Native version:** 0.73+  
**Prepared by:** Flint (iOS QA)  
**Date:** 2026-05-16  

---

## Known SPEC/Code Discrepancies

The following mismatches exist between SPEC.md and the shipped code. Tests in this document test the code's actual behaviour. Each discrepancy is noted at the relevant test.

| # | SPEC.md | Code actual |
|---|---|---|
| D-1 | Debug Easter egg: 7 taps within **4 seconds** | `DEBUG_TAP_WINDOW_MS = 8000` (8 s window). Code also supports a 5-tap **off** path not mentioned in SPEC. |
| D-2 | Default alert verbosity: **Detailed** (§8.4) | `settingsStore.ts` initialises to `AlertVerbosity.Minimal`. |
| D-3 | Settings exposes **sidebar position** (Left/Right) (§8.4) | `SettingsPanel.tsx` does not render this control. `MainScreen.tsx` uses `RoadView`, not `RadarStrip`. `RadarStrip` is an isolated component not mounted in the current main screen tree. No sidebar-position control tests are written. |
| D-4 | TTS watchdog: **6 s** (§8.3 implied by CLAUDE.md) | `TTSEngine.ts` comment says "10 s watchdog" but `WATCHDOG_MS = 6000`. Tests use 6 s. |
| D-5 | REQ-DEV-001, REQ-VIS-002, REQ-VIS-004 | Cited in code comments but not defined in SPEC v1.0. Tests reference them as `(REQ-DEV-001 — referenced in code, undefined in SPEC v1.0)`. |
| D-6 | **Test Alert button** on main screen (REQ-VIS-003, §8.2) | `MainScreen.tsx` does not render a Test Alert button. `speakImmediate()` exists on `TTSEngine` but is not wired to any visible UI element. IOS-E2E-034 is classified as a spec gap. |
| D-7 | Scan timeout: 30 s shown to user | `RealBLEManager.SCAN_DURATION_MS = 10000` — BLE scan resolves at 10 s with empty results, immediately setting scan state to `timeout`. The 30 s UI timer in `PairingStep2` is a fallback for the case where the BLE manager promise never resolves. Practical UX timeout is ~10 s. IOS-E2E-003 tests the 30 s fallback path; the 10 s fast-path is noted. |

---

## Automation Key

| Label | Tool | Runs in |
|---|---|---|
| **Jest** | Jest + React Test Renderer / `@testing-library/react-native` | CI |
| **Detox** | Detox + iOS Simulator | CI (long) or local |
| **Manual** | Human tester on physical device or simulator | QA gate |

---

## 1. Unit Tests — Alert Logic

### 1.1 Debounce

#### IOS-UNIT-001 — Count increase triggers after 750 ms debounce
**Automation:** Jest  
**REQ:** REQ-AUD-002  
**Preconditions:** Fresh `AlertEngine`, `lastSpokenState.count = 0`, fake timers installed.  
**Steps:**
1. Call `engine.evaluate([{vehicleId:1, distance:100, speed:0x44, level:1}], 'connected')` — count becomes 1.
2. Advance fake timers by 749 ms.
3. Assert `onTrigger` has **not** been called.
4. Advance fake timers by 1 ms (total 750 ms).
5. Assert `onTrigger` is called once with `{count:1, isClear:false}`.

**Pass:** `onTrigger` fires exactly once at the 750 ms boundary with correct count.  
**Fail:** Fires early, fires with wrong count, or does not fire.

---

#### IOS-UNIT-002 — Rapid count changes within debounce window are batched
**Automation:** Jest  
**REQ:** REQ-AUD-002  
**Preconditions:** Fresh `AlertEngine`, fake timers.  
**Steps:**
1. At t=0: call `evaluate` with count=1.
2. At t=300 ms: call `evaluate` with count=2.
3. At t=600 ms: call `evaluate` with count=3.
4. At t=1350 ms (750 ms after last change): assert `onTrigger` called once.
5. Verify trigger carries `count=3`.

**Pass:** Exactly one `onTrigger` call with the final stable count.  
**Fail:** Multiple triggers, or final count is not 3.

---

#### IOS-UNIT-003 — Change cap fires after 3 s on continuously unstable road
**Automation:** Jest  
**REQ:** REQ-AUD-002 ("cap ensures rider is never silent for more than 4s")  
**Preconditions:** Fresh `AlertEngine`, fake timers.  
**Steps:**
1. Every 200 ms call `evaluate` with alternating count=1 and count=2, for 3 s total.
2. Assert `onTrigger` fires at or before the 3 s mark.

**Pass:** `onTrigger` fires within 3000 ms regardless of continuous count churn.  
**Fail:** Timer never fires during the 3 s window.

---

#### IOS-UNIT-004 — Clear debounce: fires after 1.5 s with no threat recovery
**Automation:** Jest  
**REQ:** REQ-AUD-002  
**Preconditions:** `AlertEngine` with `lastSpokenState.count = 2`, fake timers.  
**Steps:**
1. Call `evaluate([], 'connected')`.
2. Advance fake timers by 1499 ms.
3. Assert `onTrigger` has **not** been called.
4. Advance fake timers by 1 ms (total 1.5 s).
5. Assert `onTrigger` called with `{isClear:true, count:0}`.

**Pass:** `onTrigger` fires at exactly 1.5 s with `isClear:true`.  
**Fail:** Fires early or does not fire.

---

#### IOS-UNIT-005 — Clear debounce is cancelled if threat returns within window
**Automation:** Jest  
**REQ:** REQ-AUD-002 ("false-clear protection")  
**Preconditions:** `AlertEngine` with `lastSpokenState.count = 1`, fake timers.  
**Steps:**
1. Call `evaluate([], 'connected')` — starts clear debounce.
2. Advance timers by 700 ms.
3. Call `evaluate([{...count:1}], 'connected')` — threat returns.
4. Advance timers by 2 s.
5. Assert `onTrigger` has never been called with `isClear:true`.

**Pass:** Clear never fires; threat re-trigger follows count-change debounce path.  
**Fail:** Spurious clear fires despite threat recovery.

---

#### IOS-UNIT-006 — Clear cap fires after 3 s if count stays zero
**Automation:** Jest  
**REQ:** REQ-AUD-002  
**Preconditions:** `AlertEngine` with `lastSpokenState.count = 1`, fake timers.  
**Steps:**
1. Call `evaluate([], 'connected')` — clear debounce starts.
2. Every 500 ms call `evaluate([], 'connected')` for 3 s total.
3. Assert that `onTrigger` fires with `isClear:true` within 3 s.

**Pass:** Clear fires at or before the 3 s cap.  
**Fail:** Does not fire within 3 s.

---

#### IOS-UNIT-007 — Engine ignores evaluate calls when not connected
**Automation:** Jest  
**REQ:** REQ-AUD-002  
**Preconditions:** Fresh `AlertEngine`, fake timers.  
**Steps:**
1. Call `engine.evaluate([{count:1}], 'disconnected')`.
2. Advance timers by 2 s.
3. Assert `onTrigger` never called.

**Pass:** No trigger fires in disconnected state.  
**Fail:** Trigger fires.

---

#### IOS-UNIT-008 — reset() cancels all pending timers
**Automation:** Jest  
**REQ:** REQ-CON-003  
**Preconditions:** `AlertEngine` with pending change debounce and clear debounce, fake timers.  
**Steps:**
1. Initiate a count-change debounce (count 0→1).
2. Initiate a clear debounce (count 1→0, then 0 again, before timer fires).
3. Call `engine.reset()`.
4. Advance timers by 5 s.
5. Assert `onTrigger` never called.

**Pass:** No triggers fire after reset.  
**Fail:** Stale timer fires post-reset.

---

### 1.2 Snapshot-on-Completion

#### IOS-UNIT-009 — Trigger dropped while speaking; snapshot fires on finish
**Automation:** Jest  
**REQ:** REQ-AUD-003  
**Preconditions:** `TTSEngine` with a mock backend, `AlertEngine` wired in, `speaking=true`.  
**Steps:**
1. Manually set `TTSEngine.speaking = true`.
2. Fire `AlertEngine.onTrigger({count:2, isClear:false})`.
3. Assert `backend.speak` not called (trigger dropped).
4. Update current threats to count=2.
5. Call the `onFinished` callback (simulating TTS completion).
6. Assert `evaluateAfterTTSFinished` is called and results in a new `speak(...)` call because count differs from `lastSpokenState`.

**Pass:** Snapshot fires after TTS finishes with current threat count.  
**Fail:** No snapshot fires, or stale count is spoken.

---

#### IOS-UNIT-010 — Snapshot does not fire if state unchanged after TTS
**Automation:** Jest  
**REQ:** REQ-AUD-003  
**Preconditions:** `TTSEngine` speaking "1 vehicle", `lastSpokenState.count = 1`.  
**Steps:**
1. Current threats remain count=1 while TTS speaks.
2. Call `onFinished`.
3. Assert no new `speak` call is made.

**Pass:** No redundant re-announcement.  
**Fail:** `speak` called with identical state.

---

#### IOS-UNIT-011 — Clear dropped while speaking; clear debounce restarts on finish
**Automation:** Jest  
**REQ:** REQ-AUD-003 ("clears that were dropped while TTS was speaking")  
**Preconditions:** TTS speaking (count=1 alert), current threats become [] while speaking.  
**Steps:**
1. TTS begins speaking "1 vehicle, medium speed".
2. Before TTS finishes, threats drop to [].
3. Call `onFinished`.
4. Advance fake timers by 1.5 s.
5. Assert `onTrigger` called with `isClear:true`.

**Pass:** Clear debounce restarts after TTS finishes; "Clear" fires after 1.5 s.  
**Fail:** Clear never fires; or fires immediately without debounce.

---

### 1.3 Threat Level Escalation

#### IOS-UNIT-012 — Pending trigger reports max level seen across debounce window
**Automation:** Jest  
**REQ:** REQ-AUD-002 ("max threat level seen during the debounce window")  
**Preconditions:** Fresh `AlertEngine`, fake timers.  
**Steps:**
1. t=0: `evaluate([{level:Medium, count:1}], 'connected')`.
2. t=200: `evaluate([{level:High, count:1}], 'connected')`.
3. t=400: `evaluate([{level:Medium, count:1}], 'connected')`.
4. Advance timers to fire debounce.
5. Assert `onTrigger.maxLevel === ThreatLevel.High`.

**Pass:** Trigger carries highest level observed during window.  
**Fail:** Trigger carries Medium (last-seen) or None.

---

#### IOS-UNIT-013 — Watchdog resets speaking state after 6 s (IOS-UNIT: WATCHDOG_MS = 6000)
**Automation:** Jest  
**REQ:** CLAUDE.md ("TTS watchdog: 6s")  
**Note:** SPEC comment says "10 s watchdog" but code constant is `WATCHDOG_MS = 6000`. Test 6 s.  
**Preconditions:** `TTSEngine`, mock backend where `onFinished` never fires, fake timers.  
**Steps:**
1. Call `_speak` (speaking=true, watchdog starts).
2. Advance fake timers by 5999 ms.
3. Assert `speaking === true`.
4. Advance fake timers by 1 ms (total 6 s).
5. Assert `speaking === false`.
6. Assert `backend.speak` is NOT called again (watchdog resets state but does not re-evaluate).

**Pass:** `speaking` resets to false at the 6 s mark; no spurious re-evaluation.  
**Fail:** Resets early, late, or triggers re-evaluation.

---

### 1.4 Packet Parsing

#### IOS-UNIT-014 — Canonical vector: 2-threat packet parses correctly
**Automation:** Jest  
**REQ:** SPEC §7 BLE Protocol  
**Preconditions:** None.  
**Steps:**
1. Parse `Uint8Array([0x82, 0xA5, 0x76, 0x58, 0xAE, 0x89, 0x44])`.
2. Assert result is not null.
3. Assert `threats.length === 2`.
4. Assert threat[0]: `vehicleId=0xA5`, `distance=0x76` (118), `speed=0x58` (88 km/h), `level=Medium` (bits 7-6 = 01).
5. Assert threat[1]: `vehicleId=0xAE`, `distance=0x89` (137), `speed=0x44` (68 km/h), `level=Medium`.

**Pass:** All fields match expected values.  
**Fail:** Any field mismatch, null return, or wrong count.

---

#### IOS-UNIT-015 — Canonical vector: 1-threat packet parses correctly
**Automation:** Jest  
**REQ:** SPEC §7 BLE Protocol  
**Steps:**
1. Parse `Uint8Array([0x82, 0xAE, 0x2B, 0x44])`.
2. Assert `threats.length === 1`.
3. Assert: `vehicleId=0xAE`, `distance=0x2B` (43), `speed=0x44` (68 km/h), `level=Medium`.

**Pass:** Single threat parsed correctly.  
**Fail:** Count ≠ 1, or field mismatch.

---

#### IOS-UNIT-016 — Canonical vector: 1-byte idle packet returns empty threats
**Automation:** Jest  
**REQ:** SPEC §7 BLE Protocol  
**Steps:**
1. Parse `Uint8Array([0x82])`.
2. Assert result is not null.
3. Assert `threats.length === 0`.

**Pass:** Empty threat array returned for idle packet.  
**Fail:** null returned or threats.length > 0.

---

#### IOS-UNIT-017 — Empty byte array returns null
**Automation:** Jest  
**REQ:** SPEC §7 BLE Protocol  
**Steps:**
1. Parse `Uint8Array([])`.
2. Assert result is `null`.

**Pass:** Returns null.  
**Fail:** Returns packet or throws.

---

#### IOS-UNIT-018 — Lower nibble of byte 0 is never used as threat count
**Automation:** Jest  
**REQ:** SPEC §7 ("lower nibble… always 0x2, never a count")  
**Preconditions:** Craft a packet with lower nibble = 0x2 that would give wrong count if nibble were used.  
**Steps:**
1. Parse `Uint8Array([0x82, 0xAE, 0x2B, 0x44])` — lower nibble = 2, actual threat count = 1.
2. Assert `threats.length === 1` (not 2).
3. Parse `Uint8Array([0x82])` — lower nibble = 2, actual threat count = 0.
4. Assert `threats.length === 0` (not 2).

**Pass:** Count derived from length, not nibble.  
**Fail:** Count equals nibble value.

---

#### IOS-UNIT-019 — Rolling counter (upper nibble) is extracted as sequenceId
**Automation:** Jest  
**REQ:** SPEC §7  
**Steps:**
1. Parse `Uint8Array([0x82])` — upper nibble = 8.
2. Assert `result.sequenceId === 8`.
3. Parse `Uint8Array([0x32, 0xAE, 0x2B, 0x44])` — upper nibble = 3.
4. Assert `result.sequenceId === 3`.

**Pass:** Correct upper nibble extracted.  
**Fail:** sequenceId wrong or mixed with lower nibble.

---

#### IOS-UNIT-020 — Threat level bit extraction: High (bits 7-6 = 10)
**Automation:** Jest  
**REQ:** SPEC §7  
**Steps:**
1. Call `parseThreatLevel(0x80)` (binary 10000000 — bits 7-6 = 10).
2. Assert result === `ThreatLevel.High` (2).

**Pass:** Returns High.  
**Fail:** Returns any other level.

---

#### IOS-UNIT-021 — Threat level bit extraction: Unknown resolves to Medium
**Automation:** Jest  
**REQ:** SPEC §7  
**Steps:**
1. Call `resolveThreatLevel(ThreatLevel.Unknown)`.
2. Assert result === `ThreatLevel.Medium` (1).

**Pass:** Unknown maps to Medium (conservative).  
**Fail:** Returns Unknown or High.

---

#### IOS-UNIT-022 — getMaxThreatLevel: High takes precedence over Medium
**Automation:** Jest  
**REQ:** SPEC §7  
**Steps:**
1. Call `getMaxThreatLevel([{level:Medium,...}, {level:High,...}, {level:None,...}])`.
2. Assert result === `ThreatLevel.High`.

**Pass:** High returned.  
**Fail:** Any lower value returned.

---

#### IOS-UNIT-023 — getMaxThreatLevel: empty array returns None
**Automation:** Jest  
**REQ:** SPEC §7  
**Steps:**
1. Call `getMaxThreatLevel([])`.
2. Assert result === `ThreatLevel.None`.

**Pass:** None returned.  
**Fail:** Returns undefined, throws, or returns a threat level.

---

### 1.5 Alert Message Builder

#### IOS-UNIT-024 — Detailed verbosity, single vehicle, medium speed
**Automation:** Jest  
**REQ:** REQ-AUD-004  
**Steps:**
1. Call `buildAlertMessage({count:1, maxLevel:ThreatLevel.Medium, isClear:false}, AlertVerbosity.Detailed)`.
2. Assert result === `"1 vehicle, medium speed"`.

**Pass:** Exact string match.  
**Fail:** Any other string.

---

#### IOS-UNIT-025 — Detailed verbosity, multiple vehicles, high speed
**Automation:** Jest  
**REQ:** REQ-AUD-004  
**Steps:**
1. Call `buildAlertMessage({count:3, maxLevel:ThreatLevel.High, isClear:false}, AlertVerbosity.Detailed)`.
2. Assert result === `"3 vehicles, high speed"`.

**Pass:** Exact string match.  
**Fail:** Any other string.

---

#### IOS-UNIT-026 — Balanced verbosity, single vehicle
**Automation:** Jest  
**REQ:** REQ-AUD-004  
**Steps:**
1. Call `buildAlertMessage({count:1, maxLevel:ThreatLevel.Medium, isClear:false}, AlertVerbosity.Balanced)`.
2. Assert result === `"1 vehicle"`.

**Pass:** Exact match.  
**Fail:** String includes speed descriptor.

---

#### IOS-UNIT-027 — Minimal verbosity, single vehicle
**Automation:** Jest  
**REQ:** REQ-AUD-004  
**Steps:**
1. Call `buildAlertMessage({count:1, maxLevel:ThreatLevel.High, isClear:false}, AlertVerbosity.Minimal)`.
2. Assert result === `"car"`.

**Pass:** Exact match.  
**Fail:** Returns "1 vehicle" or includes speed.

---

#### IOS-UNIT-028 — Minimal verbosity, multiple vehicles
**Automation:** Jest  
**REQ:** REQ-AUD-004  
**Steps:**
1. Call `buildAlertMessage({count:4, maxLevel:ThreatLevel.Medium, isClear:false}, AlertVerbosity.Minimal)`.
2. Assert result === `"4 cars"`.

**Pass:** Exact match.  
**Fail:** Returns "4 vehicles".

---

#### IOS-UNIT-029 — Clear returns "Clear" regardless of verbosity
**Automation:** Jest  
**REQ:** REQ-AUD-004  
**Steps:**
1. For each verbosity level (Detailed, Balanced, Minimal):
   - Call `buildAlertMessage({count:0, maxLevel:ThreatLevel.None, isClear:true}, verbosity)`.
   - Assert result === `"Clear"`.

**Pass:** "Clear" in all three cases.  
**Fail:** Any different string for any verbosity.

---

### 1.6 Connection Alert Engine

#### IOS-UNIT-030 — "Radar disconnected" spoken once on first drop
**Automation:** Jest  
**REQ:** REQ-CON-003  
**Steps:**
1. Create `ConnectionAlertEngine` with spy `speak` function.
2. Call `onFirstConnect()`.
3. Call `onStatusChange(ConnectionStatus.Disconnected)`.
4. Assert `speak` called once with `"Radar disconnected"`.

**Pass:** Exactly one "Radar disconnected" call.  
**Fail:** Not called, called multiple times, or wrong string.

---

#### IOS-UNIT-031 — "Radar reconnected" spoken on recovery (not on first connect)
**Automation:** Jest  
**REQ:** REQ-CON-003  
**Steps:**
1. Call `onFirstConnect()` — no speak call expected.
2. Simulate disconnect: `onStatusChange(ConnectionStatus.Disconnected)` — "Radar disconnected" expected.
3. Simulate reconnect: `onStatusChange(ConnectionStatus.Connected)`.
4. Assert `speak` called with `"Radar reconnected"` (not "Radar connected").
5. Verify `speak` was NOT called during `onFirstConnect()`.

**Pass:** "Radar reconnected" on recovery; nothing on first connect.  
**Fail:** "Radar connected" spoken, or no reconnect announcement.

---

#### IOS-UNIT-032 — "No radar signal" backoff: fires at T+30s, T+90s, T+390s, T+990s, T+1890s then silent
**Automation:** Jest  
**REQ:** REQ-CON-003  
**Preconditions:** Fake timers, engine with `hadConnection=true`.  
**Steps:**
1. Trigger disconnect.
2. Advance timers by 30000 ms — assert `speak("No radar signal")` called (step 1).
3. Advance timers by 60000 ms — assert called again (T+90s, step 2).
4. Advance timers by 300000 ms — assert called again (T+390s, step 3).
5. Advance timers by 600000 ms — assert called again (T+990s, step 4).
6. Advance timers by 900000 ms — assert called again (T+1890s, step 5).
7. Advance timers by 1000000 ms — assert `speak` NOT called again (silent).

**Pass:** Exactly 5 "No radar signal" calls at correct cumulative offsets; silent after step 5.  
**Fail:** Wrong timing, wrong count, or fires again after step 5.

---

#### IOS-UNIT-033 — Backoff cancels immediately on reconnect
**Automation:** Jest  
**REQ:** REQ-CON-003  
**Steps:**
1. Trigger disconnect — backoff starts.
2. Advance timers by 25000 ms (before first backoff at 30s).
3. Call `onStatusChange(ConnectionStatus.Connected)`.
4. Advance timers by 60000 ms.
5. Assert "No radar signal" is never spoken.

**Pass:** Backoff cancelled; no signal announcement after reconnect.  
**Fail:** "No radar signal" fires post-reconnect.

---

### 1.7 ThreatHoldover

#### IOS-UNIT-034 — 0→N count increase is immediate (no hold delay)
**Automation:** Jest  
**REQ:** SPEC §ThreatHoldover ("0→N: new car from clear road — always immediate")  
**Preconditions:** Fresh `ThreatHoldover`, spy `onUpdate`, fake timers.  
**Steps:**
1. Call `feed([{vehicleId:1, distance:100, level:Medium, speed:0x44}])` — stable is [].
2. Assert `onUpdate` called synchronously with count=1.

**Pass:** Immediate update, no timer wait.  
**Fail:** Update deferred.

---

#### IOS-UNIT-035 — Count decrease held for 2 s before committing
**Automation:** Jest  
**REQ:** SPEC §ThreatHoldover  
**Preconditions:** `ThreatHoldover` with stable=[2 threats], fake timers.  
**Steps:**
1. Call `feed([{distance:80,...}])` — count drops from 2 to 1.
2. Advance timers by 1999 ms.
3. Assert `onUpdate` still shows count=2 (stable not yet updated to 1).
4. Advance timers by 1 ms (total 2 s).
5. Assert `onUpdate` called with count=1.

**Pass:** Decrease committed exactly at 2 s.  
**Fail:** Committed early, or stable remains 2.

---

#### IOS-UNIT-036 — Count recovery during hold cancels eviction
**Automation:** Jest  
**REQ:** SPEC §ThreatHoldover ("If count recovers during the hold window")  
**Steps:**
1. `ThreatHoldover` stable=2 threats at distances 80m and 120m.
2. Call `feed([{distance:75,...}])` — count drops to 1; hold timer starts.
3. Advance timers 1 s.
4. Call `feed([{distance:70,...},{distance:115,...}])` — count recovers to 2.
5. Assert `onUpdate` called with count=2 immediately on recovery.
6. Advance timers 5 s — assert `onUpdate` not called with count=1.

**Pass:** Hold cancelled; stable=2 maintained.  
**Fail:** Count=1 committed, or update delayed.

---

#### IOS-UNIT-037 — Immediate eviction when closest vehicle distance ≤ 30 m
**Automation:** Jest  
**REQ:** SPEC §ThreatHoldover (`PASS_THRESHOLD_M = 30`)  
**Steps:**
1. `ThreatHoldover` stable=[{distance:25,...}, {distance:80,...}].
2. Call `feed([{distance:80,...}])` — count drops from 2 to 1; closest stable is 25m (≤ 30m).
3. Assert `onUpdate` called immediately with count=1 (no 2 s hold).

**Pass:** Immediate commit (car passed the rider).  
**Fail:** 2 s hold applied when close vehicle ≤ 30 m.

---

#### IOS-UNIT-038 — N→M increase (N > 0) held for 1.5 s before commit
**Automation:** Jest  
**REQ:** SPEC §ThreatHoldover (`INCREASE_HOLD_MS = 1500`)  
**Steps:**
1. `ThreatHoldover` stable=1 threat.
2. Call `feed([t1, t2])` — count increases from 1 to 2.
3. Advance timers by 1499 ms — assert `onUpdate` still shows count=1.
4. Advance timers by 1 ms — assert `onUpdate` called with count=2.

**Pass:** Increase committed at 1.5 s.  
**Fail:** Committed immediately or not at all.

---

#### IOS-UNIT-039 — Level escalation at same count is immediate
**Automation:** Jest  
**REQ:** SPEC §ThreatHoldover ("Level escalations at the same count are always immediate")  
**Steps:**
1. `ThreatHoldover` stable=[{level:Medium, count:1}].
2. Call `feed([{level:High, count:1}])` — count same, level increases.
3. Assert `onUpdate` called immediately with High threat.

**Pass:** Immediate update on escalation.  
**Fail:** Deferred.

---

### 1.8 VehicleTracker (Legacy — kept for reference tests)

#### IOS-UNIT-040 — New vehicle at different distance creates new tracked entry
**Automation:** Jest  
**Steps:**
1. Fresh `VehicleTracker`. Call `update([{distance:100, speed:0x44, level:Medium}])`.
2. Assert `trackedCount === 1`.
3. Call `update([{distance:140, speed:0x44, level:Medium}])` — 40 m gap > MATCH_DISTANCE_M.
4. Assert `trackedCount === 2`.

**Pass:** Two distinct entries tracked.  
**Fail:** Merged into one.

---

#### IOS-UNIT-041 — Vehicle evicted after 3 consecutive missed packets
**Automation:** Jest  
**Steps:**
1. `VehicleTracker` with one tracked vehicle at distance=100.
2. Call `update([])` three times (3 missed packets).
3. Assert `trackedCount === 0`.

**Pass:** Eviction after exactly 3 missed packets.  
**Fail:** Evicted early (1-2 missed), or not evicted.

---

## 2. Integration Tests — BLE Pipeline End-to-End

#### IOS-INT-001 — Raw BLE bytes flow through to TTS utterance
**Automation:** Jest  
**REQ:** REQ-AUD-001, REQ-AUD-002  
**Preconditions:** Jest integration harness: `RealBLEManager` replaced with `MockBLEManager`; `NativeTTSBackend` replaced with spy; `AlertEngine` and `TTSEngine` wired together; fake timers.  
**Steps:**
1. Set connection status to Connected.
2. Inject packet `[0x82, 0xAE, 0x2B, 0x44]` into `MockBLEManager`.
3. Advance fake timers by 750 ms (change debounce).
4. Assert `backend.speak` called with a string containing "vehicle".
5. Call `onFinished` callback.
6. Inject idle packet `[0x82]` (count → 0).
7. Advance fake timers by 1500 ms (clear debounce).
8. Assert `backend.speak` called with `"Clear"`.

**Pass:** Full BLE-to-TTS pipeline fires correct utterances in correct order.  
**Fail:** Any step missing or out of sequence.

---

#### IOS-INT-002 — ThreatHoldover absorbs 1-packet BLE dropout
**Automation:** Jest  
**REQ:** SPEC §ThreatHoldover  
**Steps:**
1. Stable state: 1 threat. Inject one idle packet `[0x82]` (count drops to 0).
2. Advance timers by 500 ms (within 2 s hold).
3. Assert `radarStore.threats.length === 1` (holdover holding).
4. Inject threat packet again after 500 ms — assert hold cancelled, count stays 1.

**Pass:** Transient dropout absorbed; no spurious count change.  
**Fail:** Store updated to 0 during hold window.

---

#### IOS-INT-003 — Battery level read at connect populates radarStore
**Automation:** Jest  
**REQ:** SPEC §12 (Battery Service `0x2A19`)  
**Preconditions:** `MockBLEManager` returns battery characteristic value `0x4B` (75) on connect.  
**Steps:**
1. Call `bleManager.connect(deviceId)`.
2. Assert `useRadarStore.getState().batteryLevel === 75`.

**Pass:** Battery level populated from characteristic read.  
**Fail:** batteryLevel remains null.

---

#### IOS-INT-004 — Multiple rapid BLE packets within 750 ms debounce produce single alert
**Automation:** Jest  
**REQ:** REQ-AUD-002  
**Steps:**
1. Inject 5 packets over 600 ms: alternating 1 and 2 threats.
2. Advance timers by 750 ms.
3. Assert `backend.speak` called exactly once.

**Pass:** Single utterance despite rapid changes.  
**Fail:** Multiple speak calls.

---

#### IOS-INT-005 — Disconnect triggers ConnectionAlertEngine and resets AlertEngine
**Automation:** Jest  
**REQ:** REQ-CON-003  
**Steps:**
1. Connected state, 1 active threat, TTS spoke "1 vehicle".
2. Simulate device disconnect event.
3. Assert `speak("Radar disconnected")` called.
4. Assert `radarStore.threats === []`.
5. Assert `AlertEngine.lastSpokenState.count === 0` (after reset).

**Pass:** Disconnect cleans up threat state and fires TTS.  
**Fail:** Stale threats remain; or disconnect not spoken.

---

#### IOS-INT-006 — Verbosity change propagates to next alert without restart
**Automation:** Jest  
**REQ:** REQ-AUD-004  
**Steps:**
1. `TTSEngine` initialised with `Detailed` verbosity.
2. Fire alert trigger {count:1, level:Medium}.
3. Assert speak called with "1 vehicle, medium speed".
4. Call `ttsEngine.setVerbosity(AlertVerbosity.Minimal)`.
5. Reset `lastSpokenState` to count=0 (simulate clear).
6. Fire alert trigger {count:1, level:High}.
7. Assert speak called with "car" (Minimal).

**Pass:** Verbosity change takes immediate effect on next alert.  
**Fail:** Old verbosity still used.

---

## 3. UI / E2E Tests — Pairing Flow

#### IOS-E2E-001 — First launch shows PairingStep1 when no device paired
**Automation:** Detox  
**REQ:** REQ-CON-001  
**Preconditions:** App installed fresh (no AsyncStorage). Device: iPhone iOS 15+.  
**Steps:**
1. Launch app.
2. Assert element with `testID="pairing-step1"` is visible.
3. Assert `testID="step-progress"` shows "Step 1 of 2".
4. Assert `testID="search-button"` is visible and labelled "Search".
5. Assert Varia device illustration (`testID="varia-illustration"`) is visible.

**Pass:** Step 1 screen visible with all elements.  
**Fail:** Main screen shown directly, or elements missing.

---

#### IOS-E2E-002 — Search button advances to PairingStep2 with scanning indicator
**Automation:** Detox  
**REQ:** REQ-CON-001  
**Preconditions:** On PairingStep1.  
**Steps:**
1. Tap `testID="search-button"`.
2. Assert `testID="pairing-step2"` becomes visible.
3. Assert `testID="step-progress"` shows "Step 2 of 2".
4. Assert `testID="scanning-indicator"` visible (ActivityIndicator).
5. Assert `testID="step-title"` shows "Select your Varia".

**Pass:** Step 2 renders with scanning state.  
**Fail:** Step 1 still shown, or scanning indicator absent.

---

#### IOS-E2E-003 — Scan timeout shows error and Try Again button
**Automation:** Detox (with mocked BLE returning no devices)  
**REQ:** REQ-CON-001  
**Note (D-7):** `RealBLEManager.SCAN_DURATION_MS = 10000`. When BLE mock returns empty results, `bleManager.scan()` resolves in ~10 s and `PairingStep2` immediately sets `scanState='timeout'`. The 30 s UI-level timer in `PairingStep2` is a safety fallback for the case where the BLE manager promise never resolves. The practical fast-path timeout is 10 s; the 30 s UI timer path is the fallback under test here.  
**Steps:**
1. Enter PairingStep2 with BLE mock that never resolves (simulating hung scan).
2. Advance JS timer by 30 s.
3. Assert `testID="timeout-message"` visible with text "Varia not found — make sure it's turned on".
4. Assert `testID="try-again-button"` visible.
5. Tap Try Again — assert scanning indicator reappears.

**Complementary fast-path test (Jest):** Mock `bleManager.scan()` returning `[]` — assert timeout state set immediately on promise resolution (no 30 s wait needed).

**Pass:** Timeout message + retry flow works.  
**Fail:** No timeout message, or Try Again does not restart scan.

---

#### IOS-E2E-004 — Device list sorted by RSSI (strongest first)
**Automation:** Detox (with mock BLE returning 3 devices at different RSSI)  
**REQ:** REQ-CON-001 (implied: "listed by signal strength")  
**Steps:**
1. Mock BLE returns devices: A(rssi=-90), B(rssi=-60), C(rssi=-75).
2. PairingStep2 renders device list.
3. Assert B (strongest) appears first in list.
4. Assert C appears second.
5. Assert A (weakest) appears third.

**Pass:** Strongest signal first.  
**Fail:** Unsorted or wrong order.

---

#### IOS-E2E-005 — Single tap on device connects and transitions to main screen
**Automation:** Detox  
**REQ:** REQ-CON-001  
**Steps:**
1. Device list shows at least one device (`testID="device-item-<id>"`).
2. Tap the first device.
3. Assert `testID="main-screen"` becomes visible.
4. Assert connection status shows "Connected" in `testID="connection-status"`.
5. Assert TTS speaks "Radar connected" (verify via mock TTS log).

**Pass:** Transition to main screen with connected status and TTS confirmation.  
**Fail:** Stays on pairing, status incorrect, or TTS silent.

---

#### IOS-E2E-006 — Connect failure shows error; device list remains visible for retry
**Automation:** Detox (with mock BLE failing `connect()`)  
**REQ:** REQ-CON-001 ("All errors allow retry — no dead ends")  
**Steps:**
1. Mock BLE throws on connect.
2. Tap device item.
3. Assert `testID="connect-error"` visible with "Couldn't connect — tap to try again".
4. Assert device list still visible.
5. Assert no navigation to main screen.

**Pass:** Error shown, device list preserved, no dead end.  
**Fail:** App crashes, or navigates away without connection.

---

#### IOS-E2E-007 — iOS Bluetooth permission dialog shown; denial shows PermissionBanner
**Automation:** Manual  
**REQ:** SPEC §8.7 (iOS Bluetooth)  
**Preconditions:** Fresh app install; no prior Bluetooth permission granted.  
**Steps:**
1. Launch app, reach PairingStep2.
2. iOS permission dialog appears: "VoxRider uses Bluetooth to connect to your Garmin Varia radar."
3. Deny the permission.
4. Assert `PermissionBanner` appears in the UI (not the scanning state).
5. Assert banner offers a path to open Settings ("Open Settings" button).

**Pass:** Permission dialog fires with correct usage string; denial shows non-crashing error state.  
**Fail:** Dialog absent, wrong usage string, or app crashes on denial.

---

## 4. UI / E2E Tests — Main Screen

#### IOS-E2E-008 — Main screen shows "Clear" state when no threats
**Automation:** Detox  
**REQ:** REQ-VIS-003  
**Note:** The main screen renders `<RoadView>` (not `<RadarStrip>`). Car elements have `testID="road-car-N"` inside `testID="road-view"`.  
**Preconditions:** App connected, radarStore.threats=[].  
**Steps:**
1. Assert `testID="main-screen"` visible.
2. Assert `testID="threat-label"` shows text containing "All Clear" (or is absent / hidden per banner fade logic).
3. Assert `testID="road-view"` is visible but contains no `testID="road-car-0"` child elements.

**Pass:** Clear state correctly represented; no car elements visible in road view.  
**Fail:** Threat label shows vehicle count; road car elements visible.

---

#### IOS-E2E-009 — Banner appears on threat arrival, auto-dismisses after 5 s
**Automation:** Detox  
**REQ:** REQ-VIS-003  
**Steps:**
1. Inject 1 threat (medium speed).
2. Assert banner with `testID="threat-label"` becomes visible with "Warning: 1 vehicle approaching, medium speed".
3. Wait 5 s.
4. Assert banner has faded out (opacity → 0 — query via accessibility or snapshot).

**Pass:** Banner visible on threat; auto-dismisses at 5 s.  
**Fail:** Banner never appears or does not fade.

---

#### IOS-E2E-010 — Connection status header reflects device state
**Automation:** Detox  
**REQ:** REQ-VIS-003  
**Steps:**
1. Assert `testID="connection-status"` shows "Connected" when status is Connected.
2. Simulate disconnect: assert shows "Radar" and device label shows "Searching…".
3. Simulate reconnect: assert shows "Connected" again.

**Pass:** Header label updates with each state transition.  
**Fail:** Label stale or shows incorrect value.

---

#### IOS-E2E-011 — Battery pill shows correct fill and colour thresholds
**Automation:** Detox / Jest (component test)  
**REQ:** REQ-VIS-003 (implied); SPEC §12 (battery characteristic)  
**Steps:**
1. Set batteryLevel = 75 — assert `testID="battery-bar"` colour is green (#22C55E) and `testID="battery-row"` shows "75%".
2. Set batteryLevel = 25 — assert colour is amber (#F59E0B).
3. Set batteryLevel = 8 — assert colour is red (#EF4444).
4. Set batteryLevel = null — assert percentage label shows "—".

**Pass:** Colour and label correct at each threshold.  
**Fail:** Wrong colour, wrong label.

---

#### IOS-E2E-012 — Conflict hint visible after 3 consecutive connection failures
**Automation:** Detox / Jest  
**REQ:** REQ-CON-004  
**Steps:**
1. Increment `radarStore.consecutiveFailures` to 3.
2. Assert `testID="conflict-hint"` is visible.
3. Assert text matches "Is another app connected to your Varia?".

**Pass:** Hint appears at threshold 3.  
**Fail:** Hint absent, appears too early, or wrong text.

---

#### IOS-E2E-013 — Swipe left opens Settings panel
**Automation:** Detox  
**REQ:** REQ-VIS-003 ("Settings — swipe left gesture")  
**Steps:**
1. On main screen, perform a left swipe (translateX < -60, |translateY| < 80).
2. Assert `testID="settings-panel"` becomes visible.

**Pass:** Settings panel opens on swipe.  
**Fail:** Swipe ignored, or wrong panel opens.

---

## 5. UI / E2E Tests — Settings Panel

#### IOS-E2E-014 — Verbosity control changes and persists across restarts
**Automation:** Detox  
**REQ:** REQ-AUD-004  
**Note (D-2):** Default on iOS code is `AlertVerbosity.Minimal`, not Detailed as stated in SPEC §8.4.  
**Steps:**
1. Open Settings panel.
2. Assert `testID="verbosity-control"` visible with three segments: Detailed, Balanced, Minimal.
3. Tap `testID="verbosity-detailed"` — assert `accessibilityState.selected === true` for Detailed.
4. Close and reopen the app.
5. Open Settings — assert Detailed is still selected.

**Pass:** Verbosity persists to AsyncStorage and survives restart.  
**Fail:** Selection lost on restart.

---

#### IOS-E2E-015 — Units toggle persists
**Automation:** Detox  
**REQ:** SPEC §8.4  
**Steps:**
1. Open Settings. Assert `testID="units-imperial"` selected by default.
2. Tap `testID="units-metric"` — assert selected.
3. Kill and relaunch app.
4. Open Settings — assert Metric still selected.

**Pass:** Units setting persists.  
**Fail:** Reverts to Imperial after restart.

---

#### IOS-E2E-016 — Announcer Voice control is NOT shown on iOS
**Automation:** Detox  
**Note:** Voice dropdown is `Platform.OS === 'android'` gated in `SettingsPanel.tsx`. This is an iOS-specific negative test.  
**Steps:**
1. Open Settings on iOS device/simulator.
2. Assert `testID="voice-dropdown-trigger"` does NOT exist in the view hierarchy.

**Pass:** Voice control absent on iOS.  
**Fail:** Voice dropdown rendered on iOS.

---

#### IOS-E2E-017 — Paired Devices: empty state shows "No devices paired" and Add Device
**Automation:** Detox  
**REQ:** SPEC §8.4  
**Steps:**
1. Ensure no devices in settingsStore.pairedDevices.
2. Open Settings.
3. Assert `testID="no-devices-text"` shows "No devices paired".
4. Assert `testID="add-device-button"` visible.

**Pass:** Empty state shown correctly.  
**Fail:** Device list shows phantom entries; Add Device absent.

---

#### IOS-E2E-018 — Remove paired device from Settings
**Automation:** Detox  
**REQ:** SPEC §8.4  
**Preconditions:** One device in pairedDevices list.  
**Steps:**
1. Open Settings — assert `testID="device-row-<id>"` visible.
2. Tap `testID="remove-device-<id>"`.
3. Assert device row disappears.
4. Assert `testID="no-devices-text"` appears.
5. Assert `testID="add-device-button"` appears.

**Pass:** Device removed; empty state restores.  
**Fail:** Device row remains; empty state not shown.

---

#### IOS-E2E-019 — Add Device button navigates to PairingStep1
**Automation:** Detox  
**REQ:** SPEC §8.4  
**Steps:**
1. Open Settings. Tap `testID="add-device-button"`.
2. Assert `testID="pairing-step1"` becomes visible.

**Pass:** Pairing flow launches from Settings.  
**Fail:** Nothing happens; or wrong screen shown.

---

#### IOS-E2E-020 — Report a Bug opens GitHub URL in browser
**Automation:** Manual  
**REQ:** REQ-SET-007  
**Steps:**
1. Open Settings. Tap `testID="report-bug-button"`.
2. Assert Safari (or default browser) opens.
3. Assert URL matches `https://github.com/nav1885/VoxRider/issues/new?title=Bug%3A%20&body=...`.
4. Assert URL body contains: app version, platform, timestamp, connection status, active threat count.
5. Assert URL body contains TTS log, alert engine log, packet log sections.

**Pass:** Browser opens with pre-filled GitHub issue URL containing all diagnostic data.  
**Fail:** Browser doesn't open; URL missing diagnostic fields; app crashes.

---

#### IOS-E2E-021 — Settings close button dismisses panel and returns to main screen
**Automation:** Detox  
**Steps:**
1. Open Settings.
2. Tap `testID="settings-close"`.
3. Assert `testID="main-screen"` is visible again.
4. Assert `testID="settings-panel"` is gone.

**Pass:** Close button restores main screen.  
**Fail:** Panel stays open or navigation broken.

---

## 6. UI / E2E Tests — Debug Mode Easter Egg

#### IOS-E2E-022 — 7 taps on logo within 8 s enables debug mode; ·DEV· badge appears
**Automation:** Detox  
**REQ:** SPEC §8.4 / REQ-DEV-001 (referenced in code, undefined in SPEC v1.0)  
**Note (D-1):** SPEC says "7 taps within 4 seconds"; code uses `DEBUG_TAP_WINDOW_MS = 8000`. Test verifies the 8 s window.  
**Implementation note:** The `<Image>` inside `AppHeader` that wraps the `GestureDetector` does not have a `testID`. Before automating this test, a `testID="debug-tap-target"` must be added to the `<Image>` element in `AppHeader.tsx`. Until then, use coordinates or Detox element matching by image source.  
**Preconditions:** App on main screen, debugMode=false.  
**Steps:**
1. Tap the logo image (centre of AppHeader — `testID="debug-tap-target"` once added) 7 times within 4 s.
2. Assert the AppHeader left section shows `·DEV·` badge text (Text element with `·DEV·` content).
3. Assert debug section is visible in MainScreen (`testID="debug-simulate-button"` visible).
4. Kill and relaunch app.
5. Assert `·DEV·` badge still visible (debug mode persisted to AsyncStorage).

**Pass:** Debug mode enabled on 7th tap; persists across restart.  
**Fail:** No response at 7 taps; badge absent; not persisted.

---

#### IOS-E2E-023 — Taps spread beyond 8 s reset counter
**Automation:** Detox  
**REQ:** REQ-DEV-001  
**Note (D-1):** Window is 8 s (code), not 4 s (SPEC).  
**Steps:**
1. Tap logo 6 times within 7 s.
2. Wait 8.5 s (counter resets).
3. Tap logo 6 more times within 4 s.
4. Assert debug mode NOT enabled.
5. Tap once more (7th within the new window).
6. Assert debug mode enabled.

**Pass:** Counter resets after 8 s gap; 7 taps within single window enables debug.  
**Fail:** Debug enabled before 7th tap in a fresh window.

---

#### IOS-E2E-024 — 5 taps while in debug mode disables it
**Automation:** Detox  
**REQ:** REQ-DEV-001  
**Note:** Dual threshold (7 on, 5 off) is not in SPEC but is in code.  
**Preconditions:** Debug mode enabled.  
**Steps:**
1. Tap logo 5 times within 8 s.
2. Assert `·DEV·` badge disappears.
3. Assert debug section (simulator button) no longer visible.

**Pass:** Debug mode disabled at 5 taps.  
**Fail:** Requires 7 taps to disable.

---

#### IOS-E2E-025 — Debug simulator button toggles threat simulation
**Automation:** Detox  
**REQ:** REQ-DEV-001  
**Preconditions:** Debug mode enabled.  
**Steps:**
1. Assert `testID="debug-simulate-button"` shows "Simulate Threats" (green).
2. Tap button.
3. Assert button turns red and shows "Stop Simulation".
4. Assert threats begin appearing in the UI (banner updates within 2 s).
5. Tap button again.
6. Assert simulation stops; threats clear.

**Pass:** Simulator starts and stops on toggle; UI responds.  
**Fail:** Button text doesn't toggle; threats don't appear; or don't clear.

---

#### IOS-E2E-026 — Debug wordmark on PairingStep1 also triggers Easter egg
**Automation:** Detox  
**REQ:** REQ-DEV-001  
**Implementation note:** `DebugWordmark` wraps a `<View>` containing `<Text>VOXRIDER</Text>` in a `GestureDetector`. The wrapping `<View>` has no `testID`. Before automating, add `testID="debug-wordmark"` to the outer `<View style={st.wrap}>` in `DebugWordmark.tsx`.  
**Preconditions:** App at PairingStep1 (fresh install), debugMode=false.  
**Steps:**
1. Tap `testID="debug-wordmark"` 7 times within 8 s.
2. Assert debug mode enabled (VOXRIDER wordmark shows `·DEV·` below it).
3. Assert "Skip (debug)" link appears on PairingStep1 (`testID="debug-skip-button"`).

**Pass:** Easter egg also works on PairingStep1.  
**Fail:** No response; Skip button absent in debug mode.

---

#### IOS-E2E-027 — Debug skip button on PairingStep1 bypasses scanning to main screen
**Automation:** Detox  
**REQ:** REQ-DEV-001  
**Preconditions:** Debug mode enabled; on PairingStep1.  
**Steps:**
1. Tap `testID="debug-skip-button"`.
2. Assert `testID="main-screen"` visible without any BLE scan or connect.

**Pass:** Main screen reached without connecting.  
**Fail:** Scan starts; pairing flow not skipped.

---

## 7. UI / E2E Tests — Threat Display

> **Note (D-3):** `MainScreen.tsx` renders `<RoadView>`, not `<RadarStrip>`. `RadarStrip` is an isolated component (not currently mounted in the main screen). Tests IOS-E2E-028..032 are component-level tests of `RadarStrip` in isolation. Tests IOS-E2E-033..034 cover the `RoadView` and banner that actually appear in the app.

#### IOS-E2E-028 — RadarStrip component: green when no threats (isolation test)
**Automation:** Jest (component)  
**REQ:** REQ-VIS-001  
**Note:** `RadarStrip` is not mounted in `MainScreen` (see D-3). This tests the component contract in isolation.  
**Steps:**
1. Render `<RadarStrip threats={[]} position="left" height={800} />` with `useColorScheme` mocked to `'dark'`.
2. Assert `testID="radar-strip"` has `backgroundColor="#16A34A"` (dark green).

**Pass:** Green strip with no threats.  
**Fail:** Any other colour.

---

#### IOS-E2E-029 — RadarStrip component: orange for medium speed threats
**Automation:** Jest (component)  
**REQ:** REQ-VIS-001  
**Steps:**
1. Render `<RadarStrip threats={[{level:Medium, distance:100, speed:0x44}]} position="left" height={800} />` with dark mode mocked.
2. Assert `testID="radar-strip"` has `backgroundColor="#EA6B0D"` (dark orange).

**Pass:** Orange strip for medium threat.  
**Fail:** Wrong colour.

---

#### IOS-E2E-030 — RadarStrip component: red for high speed threats
**Automation:** Jest (component)  
**REQ:** REQ-VIS-001  
**Steps:**
1. Render with `level:High` threat in dark mode.
2. Assert `backgroundColor="#DC2626"` (dark red).

**Pass:** Red strip.  
**Fail:** Wrong colour.

---

#### IOS-E2E-031 — RadarStrip component: car icon position represents distance (close=top, far=bottom)
**Automation:** Jest (component)  
**REQ:** REQ-VIS-001  
**Steps:**
1. Render with two threats: `{distance:10, level:Medium}` (close) and `{distance:200, level:Medium}` (far) with `height=800`.
2. Assert `testID="car-icon-0"` (closest, sorted ascending) has a smaller `top` value than `testID="car-icon-1"` (farthest).
3. Specifically: close at 10m → `top ≈ (10/255)*800 ≈ 31px`; far at 200m → `top ≈ 627px`.

**Pass:** Close vehicle renders near top; far vehicle near bottom.  
**Fail:** Inverted positions.

---

#### IOS-E2E-032 — RadarStrip component: all car icons rendered for multiple vehicles
**Automation:** Jest (component)  
**REQ:** REQ-VIS-001  
**Steps:**
1. Render with 3 threats at distances 30, 80, 140.
2. Assert `testID="car-icon-0"`, `"car-icon-1"`, `"car-icon-2"` all exist.

**Pass:** Three car icons rendered.  
**Fail:** Any icon missing.

---

#### IOS-E2E-032b — RoadView: car elements appear for each threat
**Automation:** Jest (component)  
**REQ:** REQ-VIS-001  
**Note:** This tests `RoadView` — the component actually rendered in `MainScreen`.  
**Steps:**
1. Render `<RoadView threats={[{distance:50,level:Medium,speed:0x44},{distance:100,level:High,speed:0x80}]} height={600} />`.
2. Assert `testID="road-view"` visible.
3. Assert `testID="road-car-0"` and `testID="road-car-1"` both rendered.
4. Assert slot 0 (closer, distance=50) has a lower Y value than slot 1 (distance=100), using `accessibilityHint` which stores the computed Y.

**Pass:** Two car elements rendered; closer car higher up in the view.  
**Fail:** Missing car elements; wrong Y ordering.

---

#### IOS-E2E-032c — RoadView: no car elements when threats empty
**Automation:** Jest (component)  
**REQ:** REQ-VIS-001  
**Steps:**
1. Render `<RoadView threats={[]} height={600} />`.
2. Assert `testID="road-car-0"` is absent.

**Pass:** Empty road; no car elements.  
**Fail:** Car element visible with no threats.

---

#### IOS-E2E-033 — Threat banner shows correct count and speed text
**Automation:** Jest (component) / Detox  
**REQ:** REQ-VIS-003  
**Steps:**
1. Set threats = [{level:High, distance:40, speed:0x80}] (1 vehicle, high speed).
2. Assert `testID="threat-label"` text = "Warning: 1 vehicle approaching, high speed".
3. Set threats = [{...}, {...}] (2 vehicles, medium).
4. Assert label = "Warning: 2 vehicles approaching, medium speed".

**Pass:** Correct count and speed in banner text.  
**Fail:** Count or speed label wrong.

---

## 8. UI / E2E Tests — Audio Alerts

#### IOS-E2E-034 — Test Alert fires TTS (SPEC GAP)
**Automation:** N/A  
**REQ:** REQ-VIS-003 ("Test Alert — fires a sample TTS to verify earbuds before riding")  
**Note (D-6):** `MainScreen.tsx` does not render a "Test Alert" button in the current codebase. `TTSEngine.speakImmediate()` exists but is not wired to any visible UI control. This test cannot be executed until the feature is implemented.  
**When implemented, expected steps:**
1. Navigate to main screen.
2. Tap "Test Alert" button.
3. Assert audible TTS plays a sample alert through earbuds.
4. Assert no crash.

**Status:** Blocked — feature not implemented (D-6). Track as a known gap against SPEC REQ-VIS-003.

---

#### IOS-E2E-035 — Alert not spoken when already speaking (drop behaviour)
**Automation:** Jest  
**REQ:** REQ-AUD-002 ("TTS always plays to completion — no interruptions")  
**Steps:**
1. `TTSEngine` speaking = true (mid-utterance).
2. Call `handleTrigger({count:2, isClear:false})`.
3. Assert `backend.speak` not called a second time.
4. Call `onFinished` — snapshot evaluates; if count still 2 vs lastSpoken count 1, new speak fires.
5. Assert `backend.speak` called once more (snapshot alert).

**Pass:** No double-speak; snapshot-on-completion handles update.  
**Fail:** `backend.speak` called twice concurrently.

---

#### IOS-E2E-036 — Detailed alert verbosity: spoken message includes speed descriptor
**Automation:** Manual  
**REQ:** REQ-AUD-004  
**Preconditions:** Verbosity set to Detailed; earbuds connected; radar connected.  
**Steps:**
1. Simulate 1 medium-speed vehicle appearing.
2. Wait for TTS to speak.
3. Assert spoken phrase is "1 vehicle, medium speed".

**Pass:** Exact phrase heard.  
**Fail:** Speed not included; or "car" spoken (Minimal phrasing).

---

#### IOS-E2E-037 — Balanced alert verbosity: spoken message omits speed
**Automation:** Manual  
**REQ:** REQ-AUD-004  
**Preconditions:** Verbosity set to Balanced.  
**Steps:**
1. 2 vehicles, high speed detected.
2. Wait for alert.
3. Assert spoken phrase is "2 vehicles" (no speed).

**Pass:** Speed descriptor absent.  
**Fail:** "high speed" included.

---

#### IOS-E2E-038 — Minimal alert verbosity: single vehicle says "car"
**Automation:** Manual  
**REQ:** REQ-AUD-004  
**Preconditions:** Verbosity = Minimal (code default — see D-2).  
**Steps:**
1. 1 vehicle detected.
2. Wait for alert.
3. Assert spoken phrase is "car".

**Pass:** "car" spoken.  
**Fail:** "1 vehicle" spoken.

---

#### IOS-E2E-039 — Clear announced only after threat was active; not on startup
**Automation:** Jest  
**REQ:** REQ-AUD-004 ("only spoken after a threat was active")  
**Steps:**
1. Fresh `AlertEngine` + `TTSEngine`, connection=Connected, no threats.
2. Call `evaluate([], 'connected')`.
3. Advance timers 2 s.
4. Assert `backend.speak` never called.
5. Now: inject threat, fire alert, then clear.
6. Assert "Clear" spoken after debounce.

**Pass:** Clear not spoken on clean startup; spoken only after active threat.  
**Fail:** "Clear" fires spuriously on app launch.

---

## 8b. Auto-Connect (Subsequent Rides)

#### IOS-E2E-040 — App auto-connects to remembered device on subsequent launch
**Automation:** Detox / Manual  
**REQ:** REQ-CON-002  
**Preconditions:** At least one device has been paired and stored in `settingsStore.pairedDevices`. BLE mock or real Varia is advertising.  
**Steps:**
1. Kill app after successful first-time pairing.
2. Relaunch app.
3. Assert `testID="main-screen"` is displayed directly (pairing flow is not shown).
4. Assert `testID="connection-status"` transitions to "Connected" within 15 s.
5. Assert TTS speaks "Radar connected" (verify via mock TTS log or audible check).

**Pass:** Main screen shown immediately; auto-connect succeeds with TTS confirmation.  
**Fail:** Pairing flow shown again; status stays Disconnected; TTS silent.

---

#### IOS-E2E-041 — Auto-connect shows "Searching for radar..." when device not immediately found
**Automation:** Detox (with BLE mock that does not respond immediately)  
**REQ:** REQ-CON-002 ("Searching for radar… status if not found within 30 seconds — not an error state")  
**Preconditions:** Paired device stored; BLE mock delays or withholds response.  
**Steps:**
1. Relaunch app with delayed BLE mock.
2. Assert main screen is visible.
3. Assert `testID="connection-device"` shows "Searching…" (header left section).
4. Assert no error message or pairing flow shown — this is a non-error waiting state.
5. When BLE mock eventually responds: assert status transitions to Connected.

**Pass:** Searching state displayed; no error; transitions to Connected on discovery.  
**Fail:** Error state shown; pairing flow launched; or app crashes while waiting.

---

## 9. Platform-Specific iOS Tests

### 9.1 TTS (iOS)

#### IOS-PLAT-001 — iOS TTS uses speak() interrupt; stop() is a no-op (no crash)
**Automation:** Jest  
**REQ:** CLAUDE.md ("stop() is not called on iOS due to TurboModule incompatibility")  
**Steps:**
1. `NativeTTSBackend` on iOS path. Call `speak("one", cb1)`.
2. Call `stop()`.
3. Assert `Tts.stop()` was NOT called (mock assertion).
4. Assert `pendingOnFinished` cleared to null.
5. Call `speak("two", cb2)`.
6. Assert `Tts.speak("two")` called (new utterance queued natively).

**Pass:** `stop()` is a no-op on iOS; new speak proceeds; no crash.  
**Fail:** `Tts.stop()` called; exception thrown; `cb2` never wired.

---

#### IOS-PLAT-002 — iOS TTS initialises with correct rate and silent-switch override
**Automation:** Jest  
**REQ:** CLAUDE.md ("Tts.setIgnoreSilentSwitch('ignore')"; "setDefaultRate(0.45)")  
**Preconditions:** Mock `Tts` module; iOS platform.  
**Steps:**
1. Call `backend.initialize()` on iOS.
2. Assert `Tts.getInitStatus()` called.
3. Assert `Tts.setIgnoreSilentSwitch('ignore')` called.
4. Assert `Tts.setDefaultRate(0.45)` called.
5. Assert `Tts.addEventListener('tts-finish', <handler>)` called.

**Pass:** All initialisation calls made in correct order.  
**Fail:** Any call missing or wrong argument.

---

#### IOS-PLAT-003 — TTS fires alert through physical earbuds with iPhone silent switch ON
**Automation:** Manual  
**REQ:** REQ-AUD-001; `setIgnoreSilentSwitch('ignore')`  
**Preconditions:** Physical iPhone; earbuds connected; silent switch engaged (red dot visible).  
**Steps:**
1. Engage silent switch.
2. Open VoxRider. Connect to Varia.
3. Trigger a vehicle detection alert.
4. Assert audible TTS heard through earbuds.

**Pass:** Alert audible despite silent switch.  
**Fail:** Silence; alert suppressed by switch.

---

#### IOS-PLAT-004 — speakImmediate() during ongoing utterance plays new message without crash
**Automation:** Manual / Jest (mock backend)  
**REQ:** REQ-VIS-003 ("Test Alert"); CLAUDE.md TTS iOS notes  
**Note:** On iOS, `stop()` is a no-op. `speakImmediate` sets `speaking=false`, clears watchdog, sets `speaking=true`, and calls `speak()` — the native layer handles interruption.  
**Steps (Jest):**
1. `TTSEngine.speakImmediate("test one")` — speaking becomes true.
2. While speaking, call `speakImmediate("test two")` again.
3. Assert `backend.stop()` called (no-op on iOS backend but called by TTSEngine).
4. Assert `backend.speak("test two", ...)` called.
5. Assert `speaking === true` (second utterance active).

**Steps (Manual):**
1. Begin speaking a long utterance.
2. Tap "Test Alert" immediately.
3. Assert "test two" utterance plays; no crash; no double utterance.

**Pass:** New utterance plays; no crash.  
**Fail:** Crash; "test two" not heard; double utterance.

---

### 9.2 Audio Session Ducking

#### IOS-PLAT-005 — AVAudioSession configured with .duckOthers category
**Automation:** Manual (static config check + live test)  
**REQ:** REQ-AUD-001 ("iOS audio session: AVAudioSession .duckOthers")  
**Steps (Static):**
1. In Xcode, open `ios/VoxRider/AppDelegate.mm` or `AppDelegate.swift`.
2. Locate AVAudioSession setup. Assert category is `AVAudioSessionCategoryPlayback` (or `Ambient`) with `AVAudioSessionCategoryOptionDuckOthers` option set.

**Steps (Live):**
1. Start playing music in Apple Music at moderate volume on iPhone.
2. Launch VoxRider. Connect to Varia. Trigger a TTS alert.
3. Assert music volume ducks (noticeably quieter) during alert.
4. Assert music volume returns to normal after alert completes.

**Pass:** Music audibly ducks during alert; restores after.  
**Fail:** Music not ducked; or stays quiet permanently; or alert can't be heard over music.

---

#### IOS-PLAT-006 — Audio ducking does not suppress phone call audio
**Automation:** Manual  
**REQ:** REQ-AUD-001 ("OS handles final mixing for phone calls — platform limitation")  
**Steps:**
1. Place device in active phone call.
2. Trigger TTS alert.
3. Assert phone call audio is not muted or clipped by alert.
4. Assert alert is still audible (through earbuds if both parties share).

**Pass:** Call continues; alert plays; no audio conflict crash.  
**Fail:** Call audio silenced; crash.

---

### 9.3 Background BLE

#### IOS-PLAT-007 — Info.plist declares UIBackgroundModes: bluetooth-central
**Automation:** Static — Manual  
**REQ:** SPEC §7 ("iOS Background BLE mode entitlement")  
**Steps:**
1. Open `ios/VoxRider/Info.plist`.
2. Assert `UIBackgroundModes` array contains `bluetooth-central`.

**Pass:** Entry present.  
**Fail:** Entry missing — background BLE will silently fail in production.

---

#### IOS-PLAT-008 — NSBluetoothAlwaysUsageDescription present in Info.plist
**Automation:** Static — Manual  
**REQ:** SPEC §8.7 (iOS Bluetooth permission)  
**Steps:**
1. Open `ios/VoxRider/Info.plist`.
2. Assert key `NSBluetoothAlwaysUsageDescription` exists.
3. Assert value is "VoxRider uses Bluetooth to connect to your Garmin Varia radar." or equivalent non-empty description.

**Pass:** Key present with non-empty value.  
**Fail:** Key absent — app will crash on first BLE access on iOS 13+.

---

#### IOS-PLAT-009 — BLE connection maintained while app is backgrounded (screen locked)
**Automation:** Manual (long-running)  
**REQ:** REQ-CON-003 ("Survives: screen lock, app backgrounding")  
**Preconditions:** Physical iPhone; real Varia RTL515 or simulator device; VoxRider connected.  
**Steps:**
1. Connect VoxRider to Varia. Confirm connected status and TTS "Radar connected".
2. Press Home button (background app).
3. Lock screen.
4. Wait 30 minutes.
5. Unlock and bring app to foreground.
6. Assert connection status = Connected.
7. Assert threats still updating in RadarStrip.

**Pass:** Connection maintained for 30 minutes in background.  
**Fail:** Status shows Disconnected; reconnect TTS plays indicating drop.

---

#### IOS-PLAT-010 — Background BLE drop triggers reconnect and TTS "Radar disconnected"
**Automation:** Manual  
**REQ:** REQ-CON-003  
**Preconditions:** App backgrounded and connected.  
**Steps:**
1. Background VoxRider.
2. Power off Varia (simulates drop).
3. Assert TTS "Radar disconnected" plays through earbuds within 5 s.
4. Power Varia back on.
5. Assert TTS "Radar reconnected" plays within 30 s (first reconnect interval is 3 s).

**Pass:** Disconnect and reconnect announcements heard through earbuds while app is backgrounded.  
**Fail:** Silent drop; no reconnect; crash on reconnect.

---

#### IOS-PLAT-011 — Reconnect intervals: fast (3 s) for first 60 s, slow (10 s) after
**Automation:** Manual  
**REQ:** REQ-CON-003  
**Preconditions:** App connected; Varia powered off for controlled drop.  
**Steps:**
1. Drop connection. Start timing.
2. In first 60 s: assert reconnect attempts occur approximately every 3 s (observe "Reconnecting…" flash in status).
3. After 65 s: assert retry interval extends to approximately every 10 s.

**Pass:** Correct interval observed at both phases.  
**Fail:** Wrong interval; or reconnect loop stops.

---

#### IOS-PLAT-012 — "No radar signal" backoff announcements during extended disconnect
**Automation:** Manual (long-running)  
**REQ:** REQ-CON-003  
**Steps:**
1. Connect then drop Varia for > 35 minutes.
2. Note times of "No radar signal" TTS announcements.
3. Assert announcements at approximately: T+30s, T+90s, T+390s, T+990s, T+1890s.
4. Assert no announcement after T+1890s (silent).

**Pass:** Five announcements at correct cumulative offsets; then silence.  
**Fail:** Wrong timing; extra announcement; no announcement at all.

---

### 9.4 Dark Theme Enforcement

#### IOS-PLAT-013 — Dark mode enforced regardless of iOS system appearance
**Automation:** Detox / Manual  
**REQ:** SPEC §14 ("Dark mode only. Appearance.setColorScheme('dark') is set at app root")  
**Steps:**
1. On iOS device, set System Appearance to Light Mode (Settings → Display & Brightness → Light).
2. Launch VoxRider.
3. Assert MainScreen background colour is dark (`#111827`), not white.
4. Assert AppHeader uses dark container (`#1F2937`).
5. Assert SettingsPanel uses dark background.
6. Assert no white/light background visible on any screen.

**Pass:** App renders dark on all screens regardless of system light mode.  
**Fail:** Any screen renders light theme under system Light Mode.

---

#### IOS-PLAT-014 — RadarStrip uses dark-mode colour palette
**Automation:** Jest (component with mocked useColorScheme returning 'light')
**REQ:** REQ-VIS-001  
**Note:** App forces dark regardless, but the RadarStrip reads `useColorScheme`. Since `Appearance.setColorScheme('dark')` is set at root, the hook should return 'dark' even if system is light.  
**Steps:**
1. Mock `useColorScheme` to return `'dark'` (as the App root forces).
2. Render `<RadarStrip threats={[{level:Medium,...}]} position="left" height={800} />`.
3. Assert `backgroundColor="#EA6B0D"` (dark orange, not `#F97316` light orange).

**Pass:** Dark colour values used.  
**Fail:** Light palette colours used.

---

#### IOS-PLAT-015 — Portrait-only orientation enforced
**Automation:** Manual  
**REQ:** SPEC §14 ("Portrait only. Locked in native config on both platforms.")  
**Steps:**
1. On physical iPhone, launch VoxRider.
2. Rotate device to landscape.
3. Assert app does not rotate — remains in portrait.

**Pass:** UI stays portrait; no rotation.  
**Fail:** App rotates to landscape.

---

## Appendix A — Test Coverage Matrix

| Area | IDs | Automation |
|---|---|---|
| Debounce logic | IOS-UNIT-001..008 | Jest |
| Snapshot-on-completion | IOS-UNIT-009..011 | Jest |
| Escalation / max level | IOS-UNIT-012..013 | Jest |
| Packet parsing | IOS-UNIT-014..023 | Jest |
| Alert message builder | IOS-UNIT-024..029 | Jest |
| Connection alert engine | IOS-UNIT-030..033 | Jest |
| ThreatHoldover | IOS-UNIT-034..039 | Jest |
| VehicleTracker | IOS-UNIT-040..041 | Jest |
| BLE pipeline integration | IOS-INT-001..006 | Jest |
| Pairing flow | IOS-E2E-001..007 | Detox / Manual |
| Main screen | IOS-E2E-008..013 | Detox |
| Settings panel | IOS-E2E-014..021 | Detox / Manual |
| Debug Easter egg | IOS-E2E-022..027 | Detox |
| Threat display (RadarStrip component) | IOS-E2E-028..032 | Jest |
| Threat display (RoadView component) | IOS-E2E-032b..032c | Jest |
| Threat banner | IOS-E2E-033 | Jest / Detox |
| Audio alerts | IOS-E2E-034..039 | Jest / Manual |
| Auto-connect (subsequent rides) | IOS-E2E-040..041 | Detox / Manual |
| iOS TTS | IOS-PLAT-001..004 | Jest / Manual |
| Audio session ducking | IOS-PLAT-005..006 | Manual |
| Background BLE | IOS-PLAT-007..012 | Static / Manual |
| Dark theme | IOS-PLAT-013..015 | Jest / Detox / Manual |

**Total test cases:** 80 (includes 2 blocked by spec gap: IOS-E2E-034)

---

## Appendix B — Files Under Test

| File | Tests |
|---|---|
| `src/alerts/AlertEngine.ts` | IOS-UNIT-001..013 |
| `src/ble/parseRadarPacket.ts` | IOS-UNIT-014..023 |
| `src/alerts/buildAlertMessage.ts` | IOS-UNIT-024..029 |
| `src/alerts/ConnectionAlertEngine.ts` | IOS-UNIT-030..033 |
| `src/ble/ThreatHoldover.ts` | IOS-UNIT-034..039 |
| `src/ble/VehicleTracker.ts` | IOS-UNIT-040..041 |
| `src/alerts/TTSEngine.ts` | IOS-UNIT-009..013, IOS-INT-001..006, IOS-E2E-035 |
| `src/alerts/NativeTTSBackend.ts` | IOS-PLAT-001..004 |
| `src/ble/RealBLEManager.ts` | IOS-INT-003..005, IOS-PLAT-009..012 |
| `src/ui/screens/PairingStep1.tsx` | IOS-E2E-001, IOS-E2E-026..027 |
| `src/ui/screens/PairingStep2.tsx` | IOS-E2E-002..007 |
| `src/ui/screens/MainScreen.tsx` | IOS-E2E-008..013, IOS-E2E-025 |
| `src/ui/screens/SettingsPanel.tsx` | IOS-E2E-014..021 |
| `src/ui/components/AppHeader.tsx` | IOS-E2E-010..011, IOS-E2E-022..024 |
| `src/ui/components/DebugWordmark.tsx` | IOS-E2E-026 |
| `src/ui/components/RadarStrip.tsx` | IOS-E2E-028..032, IOS-PLAT-014 |
| `src/ui/components/RoadView.tsx` | IOS-E2E-032b..032c, IOS-E2E-008 |
| `src/settings/settingsStore.ts` | IOS-E2E-014..015, IOS-E2E-022 |
| `src/utils/bugReport.ts` | IOS-E2E-020 |
| `ios/VoxRider/Info.plist` | IOS-PLAT-007..008 |

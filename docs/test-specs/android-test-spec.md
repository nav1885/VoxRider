# VoxRider Android Test Specification

**Version:** 1.0  
**Date:** 2026-05-16  
**Scope:** Android only (API 26 minimum, API 34 target)  
**Author:** Gauge — Android QA

---

## How to Read This Document

Each test record contains:

| Field | Meaning |
|---|---|
| **ID** | Unique identifier used to reference the test in CI, bug reports, and PR comments |
| **REQ** | Requirement ID from SPEC.md section 8 |
| **Type** | Unit / Integration / UI-E2E / Platform |
| **Framework** | Jest+RNTL (JS), Espresso (Android instrumented), Manual (device-only) |
| **Preconditions** | State that must be true before the test starts |
| **Steps** | Ordered actions |
| **Expected result** | Concrete, observable outcome |
| **Pass criteria** | Binary statement that defines pass |

---

## Section 1 — Unit Tests: Alert Logic

### 1.1 Debounce and Cap

---

**ID:** UT-ALE-001  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Count change from 0 to 1 fires after 750 ms debounce, not immediately.

**Preconditions:**
- `AlertEngine` constructed with mock `onTrigger` callback
- `jest.useFakeTimers()` active
- `lastSpokenState.count = 0`

**Steps:**
1. Call `engine.evaluate([mediumThreat], ConnectionStatus.Connected)`
2. Assert `fired` is empty (debounce not yet elapsed)
3. Call `jest.advanceTimersByTime(751)`
4. Assert `fired` has exactly 1 element

**Expected result:** Alert fires exactly once after 750 ms with `{count: 1, isClear: false}`.

**Pass criteria:** `fired.length === 1 && fired[0].count === 1 && fired[0].isClear === false`

---

**ID:** UT-ALE-002  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Rapid count changes within the debounce window are batched — only the final stable count is announced.

**Preconditions:** Same as UT-ALE-001

**Steps:**
1. Call `engine.evaluate([1 threat], Connected)`
2. Advance 200 ms
3. Call `engine.evaluate([2 threats], Connected)`
4. Advance 200 ms
5. Call `engine.evaluate([3 threats], Connected)`
6. Advance 751 ms

**Expected result:** Exactly one trigger fires with `count: 3`.

**Pass criteria:** `fired.length === 1 && fired[0].count === 3`

---

**ID:** UT-ALE-003  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Change cap (3 000 ms) forces announcement even when count keeps oscillating.

**Preconditions:** Same as UT-ALE-001

**Steps:**
1. Call `engine.evaluate([1 threat], Connected)`
2. In a loop (5 iterations): advance 400 ms, emit 2 threats, advance 400 ms, emit 1 threat
3. After loop, assert `fired.length >= 1`

**Expected result:** At least one trigger has fired before 3 000 ms elapses from the first change.

**Pass criteria:** `fired.length >= 1` within 4 000 ms of first evaluate call

---

**ID:** UT-ALE-004  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Level-only change (same count) does NOT trigger an alert.

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluate([highThreat], Connected)`
2. Advance 3 001 ms

**Expected result:** No triggers fire.

**Pass criteria:** `fired.length === 0`

---

**ID:** UT-ALE-005  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Count decrease (3 → 1, not to zero) triggers alert after debounce.

**Preconditions:** `lastSpokenState.count = 3`

**Steps:**
1. Call `engine.evaluate([1 threat], Connected)`
2. Advance 751 ms

**Expected result:** Alert fires with `{count: 1, isClear: false}`.

**Pass criteria:** `fired[0].count === 1 && fired[0].isClear === false`

---

**ID:** UT-ALE-006  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Count oscillates back to lastSpoken before debounce fires — no alert.

**Preconditions:** `lastSpokenState.count = 2`

**Steps:**
1. Call `engine.evaluate([1 threat], Connected)`
2. Advance 300 ms
3. Call `engine.evaluate([2 threats], Connected)` (oscillates back)
4. Advance 751 ms

**Expected result:** No triggers fire.

**Pass criteria:** `fired.length === 0`

---

**ID:** UT-ALE-007  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** The worst-case threat level observed during the debounce window is reported, not just the final level.

**Preconditions:** `lastSpokenState.count = 0`

**Steps:**
1. Call `engine.evaluate([highThreat], Connected)`
2. Advance 300 ms
3. Call `engine.evaluate([mediumThreat], Connected)`
4. Advance 451 ms (total > 750 ms)

**Expected result:** `fired[0].maxLevel === ThreatLevel.High`

**Pass criteria:** `fired[0].maxLevel === 2` (ThreatLevel.High)

---

**ID:** UT-ALE-008  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Connection gate — evaluate is a no-op when status is not `Connected`.

**Preconditions:** `lastSpokenState.count = 0`

**Steps:**
1. Call `engine.evaluate([mediumThreat], ConnectionStatus.Scanning)`
2. Advance 3 001 ms
3. Call `engine.evaluate([mediumThreat], ConnectionStatus.Reconnecting)`
4. Advance 3 001 ms

**Expected result:** No triggers fire for either call.

**Pass criteria:** `fired.length === 0`

---

### 1.2 All-Clear Debounce

---

**ID:** UT-ALE-009  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** All-clear fires after the 1 500 ms clear debounce.

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluate([], Connected)`
2. Assert no trigger yet
3. Advance 1 501 ms

**Expected result:** Exactly one clear trigger fires: `{isClear: true, count: 0}`.

**Pass criteria:** `fired.length === 1 && fired[0].isClear === true`

---

**ID:** UT-ALE-010  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** All-clear does not fire if last spoken state was already clear (count = 0).

**Preconditions:** `lastSpokenState.count = 0`

**Steps:**
1. Call `engine.evaluate([], Connected)`
2. Advance 3 001 ms

**Expected result:** No triggers fire.

**Pass criteria:** `fired.length === 0`

---

**ID:** UT-ALE-011  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** A new threat arriving during the clear debounce window cancels the clear and does not fire it.

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluate([], Connected)` — starts clear debounce
2. Advance 1 400 ms (< 1 500 ms debounce)
3. Call `engine.evaluate([mediumThreat], Connected)` — new car arrives
4. Advance 3 001 ms

**Expected result:** No clear trigger fires; a count trigger fires instead.

**Pass criteria:** `fired.filter(f => f.isClear).length === 0`

---

**ID:** UT-ALE-012  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** Clear cap forces the clear announcement within 3 000 ms.

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluate([], Connected)`
2. Advance 3 001 ms

**Expected result:** Exactly one clear trigger has fired (either by debounce at 1 500 ms or by cap at 3 000 ms).

**Pass criteria:** `fired.filter(f => f.isClear).length === 1`

---

**ID:** UT-ALE-013  
**REQ:** REQ-AUD-002  
**Type:** Unit  
**Framework:** Jest

**Description:** A new threat cancels the pending count-change debounce when threats immediately clear.

**Preconditions:** `lastSpokenState.count = 0`

**Steps:**
1. Call `engine.evaluate([mediumThreat], Connected)` — starts change debounce
2. Advance 300 ms
3. Call `engine.evaluate([], Connected)` — clears road
4. Advance 751 ms

**Expected result:** No non-clear trigger fires. Clear debounce starts (lastSpoken was 0 so clear also does not fire).

**Pass criteria:** `fired.filter(f => !f.isClear).length === 0`

---

### 1.3 Snapshot-on-Completion

---

**ID:** UT-ALE-014  
**REQ:** REQ-AUD-003  
**Type:** Unit  
**Framework:** Jest

**Description:** `evaluateAfterTTSFinished` re-schedules a debounced alert when count changed since last spoken.

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluateAfterTTSFinished([mediumThreat, mediumThreat], Connected)` — count now 2
2. Assert no trigger yet
3. Advance 751 ms

**Expected result:** One trigger fires with `count: 2`.

**Pass criteria:** `fired.length === 1 && fired[0].count === 2`

---

**ID:** UT-ALE-015  
**REQ:** REQ-AUD-003  
**Type:** Unit  
**Framework:** Jest

**Description:** `evaluateAfterTTSFinished` does not fire if count is unchanged.

**Preconditions:** `lastSpokenState.count = 2`

**Steps:**
1. Call `engine.evaluateAfterTTSFinished([mediumThreat, mediumThreat], Connected)`
2. Advance 751 ms

**Expected result:** No triggers fire.

**Pass criteria:** `fired.length === 0`

---

**ID:** UT-ALE-016  
**REQ:** REQ-AUD-003  
**Type:** Unit  
**Framework:** Jest

**Description:** `evaluateAfterTTSFinished` does not fire if only threat level changed (same count).

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluateAfterTTSFinished([highThreat], Connected)` — count still 1
2. Advance 751 ms

**Expected result:** No triggers fire.

**Pass criteria:** `fired.length === 0`

---

**ID:** UT-ALE-017  
**REQ:** REQ-AUD-003  
**Type:** Unit  
**Framework:** Jest

**Description:** `evaluateAfterTTSFinished` starts the clear debounce when road is empty and last spoken count > 0.

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluateAfterTTSFinished([], Connected)`
2. Assert no trigger fired immediately
3. Advance 1 501 ms

**Expected result:** Clear trigger fires.

**Pass criteria:** `fired.length === 1 && fired[0].isClear === true`

---

**ID:** UT-ALE-018  
**REQ:** REQ-AUD-003  
**Type:** Unit  
**Framework:** Jest

**Description:** `evaluateAfterTTSFinished` does not start a second clear debounce if one is already running.

**Preconditions:** `lastSpokenState.count = 1`

**Steps:**
1. Call `engine.evaluate([], Connected)` — starts clear debounce
2. Call `engine.evaluateAfterTTSFinished([], Connected)` — should not start second timer
3. Advance 3 001 ms

**Expected result:** Exactly one clear trigger fires (not two).

**Pass criteria:** `fired.filter(f => f.isClear).length === 1`

---

**ID:** UT-ALE-019  
**REQ:** REQ-AUD-003  
**Type:** Unit  
**Framework:** Jest

**Description:** Full 3-alert sequence — first car → clear → new car — all three are announced without missed alerts.

**Preconditions:** Fresh `AlertEngine`, `lastSpokenState.count = 0`

**Steps:**
1. Evaluate `[mediumThreat]`; advance 751 ms → `speak(fired[0])`
2. Evaluate `[]`; advance 1 501 ms → `speak(fired[1])`
3. Evaluate `[mediumThreat]`; advance 751 ms

**Expected result:** `fired` contains exactly 3 entries: count=1, isClear=true, count=1.

**Pass criteria:** `fired.length === 3` with correct payloads in order

---

### 1.4 Escalation Behaviour

The spec states medium→high escalation fires on the next snapshot-on-completion evaluation without debounce. AlertEngine itself does not differentiate escalation from level change (level is never a trigger). ThreatHoldover propagates escalations immediately at the same count. Tests UT-HLD-003 and UT-TTS-009 verify the full path.

---

### 1.5 Background Timer Fallback

---

**ID:** UT-ALE-020  
**REQ:** REQ-CON-003  
**Type:** Unit  
**Framework:** Jest

**Description:** When JS timers are throttled (background simulation), the wall-clock fallback inside `_schedulePendingChange` fires on the next BLE packet after `CHANGE_DEBOUNCE_MS` has elapsed.

**Preconditions:** `jest.useFakeTimers()` — do NOT advance timers. Use `Date.now` mock to simulate elapsed wall time.

**Steps:**
1. Mock `Date.now` to return `T`
2. Call `engine.evaluate([mediumThreat], Connected)` — `pendingFirstSeen = T`
3. Assert no trigger fires
4. Mock `Date.now` to return `T + 751`
5. Call `engine.evaluate([mediumThreat], Connected)` (next BLE packet at same count — triggers the wall-clock check but also hits the "same as lastSpoken" check; use a different count to confirm)

**Implementation note:** Set `lastSpokenState.count = 0` before the second evaluate so the count remains different. The second `_schedulePendingChange` call should detect `Date.now() - pendingFirstSeen >= CHANGE_DEBOUNCE_MS` and call `_firePending()` inline.

**Expected result:** Alert fires on the second `evaluate` call without any timer advance.

**Pass criteria:** `fired.length === 1` after second evaluate with no timer advance

---

## Section 2 — Unit Tests: Packet Parsing

### 2.1 Canonical Hardware Captures

---

**ID:** UT-PKT-001  
**REQ:** SPEC §7 BLE Protocol  
**Type:** Unit  
**Framework:** Jest

**Description:** Two-threat demo packet `82 A5 76 58 AE 89 44` parses correctly.

**Preconditions:** `parseRadarPacket` imported

**Steps:**
1. Call `parseRadarPacket(new Uint8Array([0x82, 0xA5, 0x76, 0x58, 0xAE, 0x89, 0x44]))`

**Expected result:**
- `threats.length === 2`
- `threats[0]`: `{vehicleId: 0xA5, distance: 0x76 (118m), speed: 0x58 (88 km/h), level: Medium}`
- `threats[1]`: `{vehicleId: 0xAE, distance: 0x89 (137m), speed: 0x44 (68 km/h), level: Medium}`

**Pass criteria:** Both threats match exactly (vehicleId, distance, speed, level)

---

**ID:** UT-PKT-002  
**REQ:** SPEC §7 BLE Protocol  
**Type:** Unit  
**Framework:** Jest

**Description:** Single-threat demo packet `82 AE 2B 44` parses to exactly one threat.

**Steps:**
1. Call `parseRadarPacket(new Uint8Array([0x82, 0xAE, 0x2B, 0x44]))`

**Expected result:** `threats.length === 1`, `threats[0].vehicleId === 0xAE`, `threats[0].distance === 0x2B (43m)`

**Pass criteria:** Single threat with correct fields

---

**ID:** UT-PKT-003  
**REQ:** SPEC §7 BLE Protocol  
**Type:** Unit  
**Framework:** Jest

**Description:** Clear packet `82` (1 byte) returns empty threats array — not null.

**Steps:**
1. Call `parseRadarPacket(new Uint8Array([0x82]))`

**Expected result:** Result is not null; `threats.length === 0`

**Pass criteria:** `result !== null && result.threats.length === 0`

---

**ID:** UT-PKT-004  
**REQ:** SPEC §7 BLE Protocol — "lower nibble is NOT a threat count"  
**Type:** Unit  
**Framework:** Jest

**Description:** Critical regression: lower nibble `0x2` is NOT interpreted as threat count. The single-threat 4-byte packet must yield 1 threat, not be classified as a split fragment and dropped.

**Steps:**
1. Call `parseRadarPacket(new Uint8Array([0x82, 0xAE, 0x2B, 0x44]))`

**Expected result:** Result is not null; `threats.length === 1` (count derived from `(length - 1) / 3 = 1`)

**Pass criteria:** `result !== null && result.threats.length === 1`

---

**ID:** UT-PKT-005  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Empty byte array returns null.

**Steps:**
1. Call `parseRadarPacket(new Uint8Array([]))`

**Expected result:** `null`

**Pass criteria:** Return value is strictly `null`

---

**ID:** UT-PKT-006  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Incomplete trailing bytes are ignored — partial third threat in a 9-byte packet.

**Steps:**
1. Call `parseRadarPacket(new Uint8Array([0x12, 0x01, 80, 0x44, 0x02, 60]))` — 6 bytes = header + 1 full threat + 2 extra bytes

**Expected result:** `threats.length === 1`

**Pass criteria:** Only complete 3-byte threat triplets are parsed

---

**ID:** UT-PKT-007  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Speed byte bit decoding — bits 7–6 extract correct threat levels.

**Steps (tabulated):**

| Input speed byte | Expected level |
|---|---|
| `0x44` (68 km/h) | Medium (01) |
| `0x82` (130 km/h) | High (10) |
| `0xC0` (192 km/h) | Unknown (11) |
| `0x1E` (30 km/h) | None (00) |

**Pass criteria:** Each row produces the expected `ThreatLevel` enum value

---

**ID:** UT-PKT-008  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Rolling counter (upper nibble) is correctly extracted into `sequenceId`.

**Steps:**
1. Parse `[0x82, 0xAE, 0x2B, 0x44]` — header upper nibble = `8`

**Expected result:** `result.sequenceId === 8`

**Pass criteria:** `sequenceId` equals the upper nibble value

---

**ID:** UT-PKT-009  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** `getMaxThreatLevel` resolves Unknown to Medium (conservative default).

**Steps:**
1. Call `getMaxThreatLevel([{level: ThreatLevel.Unknown, ...}])`

**Expected result:** Returns `ThreatLevel.Medium`

**Pass criteria:** Return value is `ThreatLevel.Medium (1)`, not `ThreatLevel.Unknown (3)` or `ThreatLevel.None (0)`

---

**ID:** UT-PKT-010  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** `getMaxThreatLevel` returns High when any threat is High, regardless of order.

**Steps:**
1. Call with `[Medium, High]`
2. Call with `[High, Medium]`

**Expected result:** Both calls return `ThreatLevel.High`

**Pass criteria:** Both results equal `ThreatLevel.High (2)`

---

### 2.2 ThreatHoldover

---

**ID:** UT-HLD-001  
**REQ:** SPEC §7 (BLE dropout handling)  
**Type:** Unit  
**Framework:** Jest

**Description:** A 0→N count increase propagates immediately (safety-critical).

**Steps:**
1. Create `ThreatHoldover`, capture updates
2. Call `feed([mediumThreat])`

**Expected result:** `onUpdate` called immediately with 1 threat.

**Pass criteria:** `updates.length === 1` without any timer advance

---

**ID:** UT-HLD-002  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** N→M count increase (N > 0) is held for 1 500 ms before committing.

**Steps:**
1. `feed([med()])` — 0→1, immediate
2. `feed([med(), med(60)])` — 1→2, held
3. Assert `updates.length === 1` (held)
4. Advance 1 501 ms
5. Assert `updates.length === 2` with 2 threats

**Pass criteria:** Second update appears only after timer expires

---

**ID:** UT-HLD-003  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Level escalation at the same count propagates immediately.

**Steps:**
1. `feed([med(80)])` — 0→1, immediate
2. `feed([high(60)])` — same count, higher level

**Expected result:** `updates[1][0].level === ThreatLevel.High` without timer advance

**Pass criteria:** Two immediate updates

---

**ID:** UT-HLD-004  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Count decrease is held for 2 000 ms and propagates to zero if count stays low.

**Steps:**
1. `feed([med()])` — 0→1, immediate
2. `feed([])` — 1→0, hold starts
3. Assert still 1 update
4. Advance 2 001 ms
5. Assert `updates[1].length === 0`

**Pass criteria:** Clear propagates only after hold elapses

---

**ID:** UT-HLD-005  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Count recovers within holdover window — hold cancelled, no false clear emitted.

**Steps:**
1. `feed([med(80)])` — stable at 1
2. `feed([])` — hold starts
3. Advance 1 000 ms (< 2 000 ms)
4. `feed([med(70)])` — car reappears
5. Advance 2 000 ms

**Expected result:** Most recent update has 1 threat; no zero-threat update emitted

**Pass criteria:** No entry in updates has length 0

---

**ID:** UT-HLD-006  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** Pass-threshold eviction: when the closest car was ≤ 30 m when count drops, evict immediately (car passed the rider).

**Steps:**
1. `feed([med(25)])` — car at 25 m
2. `feed([])` — car disappears

**Expected result:** Two immediate updates, second is empty (no 2 s hold).

**Pass criteria:** `updates.length === 2` with no timer advance

---

**ID:** UT-HLD-007  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** RTL515 phantom multi-slot bug: a single physical car that oscillates between 1 and 2 BLE threat slots never triggers a "2 cars" commit.

**Steps:**
1. `feed([med(120)])` — 1 car
2. `feed([med(110), med(110)])` — phantom 2 slots; increase hold starts
3. `feed([med(100)])` — back to 1; hold cancelled
4. Repeat steps 2–3 two more times
5. Advance 2 000 ms

**Expected result:** No update ever shows 2 threats.

**Pass criteria:** `updates.every(u => u.length <= 1)`

---

**ID:** UT-HLD-008  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** `reset()` cancels both decrease and increase holds and emits empty threats immediately.

**Steps:**
1. `feed([med()])` — stable
2. `feed([])` — decrease hold starts
3. Call `holdover.reset()`
4. Advance 3 000 ms

**Expected result:** Only one zero-length update (from reset), not two (no hold-fired zero).

**Pass criteria:** `updates.filter(u => u.length === 0).length === 1`

---

## Section 3 — Unit Tests: BLE Protocol

---

**ID:** UT-BLE-001  
**REQ:** SPEC §7 BLE Protocol  
**Type:** Unit  
**Framework:** Jest

**Description:** `buildAlertMessage` produces correct strings for all verbosity levels × threat counts × threat levels.

**Preconditions:** `buildAlertMessage` imported

**Steps (tabulated):**

| Verbosity | count | maxLevel | Expected string |
|---|---|---|---|
| Detailed | 1 | Medium | `"1 vehicle, medium speed"` |
| Detailed | 2 | High | `"2 vehicles, high speed"` |
| Balanced | 1 | High | `"1 vehicle"` |
| Balanced | 3 | Medium | `"3 vehicles"` |
| Minimal | 1 | Medium | `"car"` |
| Minimal | 4 | High | `"4 cars"` |
| Detailed | 0 | None | `"Clear"` (isClear=true) |

**Pass criteria:** All 7 cases produce the exact expected string

---

**ID:** UT-BLE-002  
**REQ:** REQ-AUD-004  
**Type:** Unit  
**Framework:** Jest

**Description:** `buildAlertMessage` never includes a distance in any output string.

**Steps:**
1. Build all 7 message combinations in UT-BLE-001
2. For each string, assert it does not contain any numeric distance value or the word "metres"/"feet"

**Pass criteria:** No output string matches `/\d+\s*(m|ft|metres|feet)/i`

---

**ID:** UT-BLE-003  
**REQ:** REQ-AUD-004  
**Type:** Unit  
**Framework:** Jest

**Description:** Unknown threat level is treated as Medium in TTS messages (conservative default via `getMaxThreatLevel`).

**Steps:**
1. Build an `AlertTrigger` with `maxLevel: ThreatLevel.Unknown` (this can only arrive if AlertEngine fires with Unknown)
2. Simulate by passing `resolveThreatLevel(Unknown)` result into buildAlertMessage

**Expected result:** Message contains "medium speed" for Detailed verbosity

**Pass criteria:** String equals `"1 vehicle, medium speed"`

---

## Section 4 — Integration Tests: BLE Pipeline End-to-End

---

**ID:** IT-PIPE-001  
**REQ:** REQ-AUD-002, REQ-AUD-003  
**Type:** Integration  
**Framework:** Jest

**Description:** Full ride scenario: BLE packet → parser → AlertEngine → TTSEngine announces correct messages in order.

**Preconditions:**
- `MockBLEManager`, `AlertEngine`, `TTSEngine` (with auto-finishing mock backend) wired together
- `jest.useFakeTimers()`

**Steps:**
1. Emit 1 medium threat via `MockBLEManager`; advance 751 ms → verify `spoken[0] === '1 vehicle, medium speed'`
2. Emit 2 threats (medium + high); advance 751 ms → verify last spoken is `'2 vehicles, high speed'`
3. Emit clear `[]`; advance 3 001 ms → verify `spoken.includes('Clear')`

**Expected result:** Three distinct utterances in the correct order.

**Pass criteria:** Exact string matches for all three utterances

---

**ID:** IT-PIPE-002  
**REQ:** REQ-AUD-002  
**Type:** Integration  
**Framework:** Jest

**Description:** No alerts fire when BLE connection status is `Disconnected`.

**Preconditions:** Connection status set to `ConnectionStatus.Disconnected`

**Steps:**
1. Emit high-speed threat
2. Advance 3 001 ms

**Expected result:** `spoken` array is empty.

**Pass criteria:** `spoken.length === 0`

---

**ID:** IT-PIPE-003  
**REQ:** REQ-AUD-002  
**Type:** Integration  
**Framework:** Jest

**Description:** Level-only change (same count) does not trigger audio alert end-to-end.

**Preconditions:** `lastSpokenState.count = 1` (simulates prior announcement)

**Steps:**
1. Emit 1 high-speed threat (same count, escalated level)
2. Advance 3 001 ms

**Expected result:** No new utterances.

**Pass criteria:** `spoken.length === 0`

---

**ID:** IT-PIPE-004  
**REQ:** REQ-AUD-002  
**Type:** Integration  
**Framework:** Jest

**Description:** Count decrease (not to zero) fires updated count utterance.

**Preconditions:** `lastSpokenState.count = 3`

**Steps:**
1. Emit `[medium, medium]` (count=2)
2. Advance 751 ms

**Expected result:** `spoken[0] === '2 vehicles, medium speed'`

**Pass criteria:** Correct count and verbosity in utterance

---

**ID:** IT-PIPE-005  
**REQ:** REQ-AUD-003  
**Type:** Integration  
**Framework:** Jest

**Description:** Snapshot-on-completion: second car arrives while TTS is speaking; alert announced after speech finishes.

**Steps:**
1. Emit 1 threat → advance 751 ms → speaking begins
2. Emit 2 threats while still "speaking" → assert no second utterance yet
3. Allow TTS to finish (advance 1 ms for mock callback)
4. Advance 751 ms for snapshot debounce

**Expected result:** Second utterance is `'2 vehicles, medium speed'`.

**Pass criteria:** `spoken[1] === '2 vehicles, medium speed'`

---

**ID:** IT-PIPE-006  
**REQ:** REQ-AUD-003 — "TTS always finishes in full"  
**Type:** Integration  
**Framework:** Jest

**Description:** Rapid threat changes while TTS is speaking never call `backend.stop()`.

**Steps:**
1. Emit 1 threat; advance 751 ms → speaking begins
2. Emit 3 rapid changes while speaking

**Expected result:** `backend.stopCount === 0`

**Pass criteria:** `stopCount` remains zero throughout

---

**ID:** IT-PIPE-007  
**REQ:** REQ-CON-001  
**Type:** Integration  
**Framework:** Jest

**Description:** On successful BLE connection, `ConnectionAlertEngine.onFirstConnect()` does not fire "Radar reconnected" — only "Radar connected" (via the app caller).

**Preconditions:** `ConnectionAlertEngine` constructed with mock speak callback

**Steps:**
1. Call `engine.onFirstConnect()`
2. Assert "Radar reconnected" was NOT spoken

**Expected result:** No speak calls for reconnected message.

**Pass criteria:** `speak` not called (connection messages are fired by the app layer on first connect, not by `onFirstConnect`)

---

**ID:** IT-PIPE-008  
**REQ:** REQ-CON-003  
**Type:** Integration  
**Framework:** Jest

**Description:** `ConnectionAlertEngine` fires "Radar disconnected" on `Connected → Disconnected` transition, then "Radar reconnected" on recovery.

**Steps:**
1. Call `engine.onFirstConnect()` — sets hadConnection=true
2. Call `engine.onStatusChange(Disconnected)` → assert "Radar disconnected" spoken
3. Call `engine.onStatusChange(Connected)` → assert "Radar reconnected" spoken

**Expected result:** Messages in correct order: disconnected, then reconnected.

**Pass criteria:** Speak called twice with correct string arguments

---

**ID:** IT-PIPE-009  
**REQ:** REQ-CON-003  
**Type:** Integration  
**Framework:** Jest

**Description:** `ConnectionAlertEngine` fires "No radar signal" on exponential backoff schedule: T+30s, T+90s, T+390s, T+990s, T+1890s, then silent.

**Steps:**
1. `onFirstConnect()`
2. `onStatusChange(Disconnected)`
3. Advance 30 001 ms → assert 1st "No radar signal"
4. Advance 60 000 ms → assert 2nd "No radar signal" (cumulative T+90s)
5. Advance 300 000 ms → assert 3rd (T+390s)
6. Advance 600 000 ms → assert 4th (T+990s)
7. Advance 900 000 ms → assert 5th (T+1890s)
8. Advance 1 000 000 ms → assert no 6th "No radar signal"

**Expected result:** Exactly 5 "No radar signal" announcements; silent after.

**Pass criteria:** `noSignalCount === 5` after total elapsed time

---

**ID:** IT-PIPE-010  
**REQ:** REQ-CON-003  
**Type:** Integration  
**Framework:** Jest

**Description:** Backoff timers are cancelled on reconnect.

**Steps:**
1. `onFirstConnect()`
2. `onStatusChange(Disconnected)` → backoff starts
3. Advance 25 000 ms (before first backoff at 30s)
4. `onStatusChange(Connected)` → reconnected
5. Advance 60 000 ms

**Expected result:** No "No radar signal" announcements fire after reconnect.

**Pass criteria:** "No radar signal" never spoken

---

## Section 5 — Integration Tests: VoxTTSModule (Android Kotlin)

These tests target the Kotlin `VoxTTSModule.kt` native module. They require either an instrumented Android test (`@RunWith(AndroidJUnit4::class)`) or a mock Robolectric environment.

---

**ID:** IT-TTS-001  
**REQ:** SPEC §7 (TTS Architecture)  
**Type:** Integration / Android Instrumented  
**Framework:** Espresso / Robolectric

**Description:** `VoxTTSModule.speak()` calls `TextToSpeech.speak()` with `QUEUE_FLUSH`, not `QUEUE_ADD`.

**Preconditions:**
- Android device or emulator (API 26+)
- `VoxTTSModule` constructed with a real `ReactApplicationContext`
- `TextToSpeech` mocked or shadowed to capture the `queueMode` argument

**Steps:**
1. Construct `VoxTTSModule`
2. Wait for TTS `onInit(SUCCESS)` callback (or use mock TTS)
3. Call `module.speak("1 vehicle, medium speed")`
4. Assert captured `queueMode === TextToSpeech.QUEUE_FLUSH`

**Expected result:** TTS called with `QUEUE_FLUSH`.

**Pass criteria:** `capturedQueueMode == TextToSpeech.QUEUE_FLUSH`

---

**ID:** IT-TTS-002  
**REQ:** SPEC §7 (Audio Focus)  
**Type:** Integration / Android Instrumented  
**Framework:** Espresso

**Description:** `VoxTTSModule.speak()` requests `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` on `STREAM_MUSIC` before speaking. Audio focus is abandoned after `onDone`.

**Preconditions:** Android device API 26+; mock `AudioManager` that records focus requests.

**Steps:**
1. Call `module.speak("test")`
2. Assert focus request type is `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`
3. Allow utterance to complete (simulate `onDone`)
4. Assert `abandonAudioFocusRequest` (API 26+) or `abandonAudioFocus` (below) called once

**Expected result:** Focus requested before speech, abandoned after completion.

**Pass criteria:** Focus acquire called once; abandon called once after `onDone`

---

**ID:** IT-TTS-003  
**REQ:** SPEC §7 (Audio Focus)  
**Type:** Integration / Android Instrumented  
**Framework:** Espresso

**Description:** Audio focus is also abandoned on `onStop` (interrupted utterance).

**Preconditions:** Same as IT-TTS-002

**Steps:**
1. Call `module.speak("test")`
2. Call `module.stop()` (simulates `QUEUE_FLUSH` from next speak)
3. Assert `abandonAudioFocus` called

**Pass criteria:** Abandon called after stop

---

**ID:** IT-TTS-004  
**REQ:** SPEC §7  
**Type:** Integration / Android Instrumented  
**Framework:** Espresso

**Description:** `VoxTTSModule.getVoices()` returns at most 3 voices (US, GB, AU), all offline (no network required), all English.

**Preconditions:** Device has English TTS voices installed offline.

**Steps:**
1. Await `module.getVoices()` promise
2. Assert each returned voice has `locale.language == "en"` and `!isNetworkConnectionRequired`
3. Assert returned regions are a subset of `["US", "GB", "AU"]`

**Expected result:** 0–3 voices, all offline English.

**Pass criteria:** All returned voices match the filter criteria

---

**ID:** IT-TTS-005  
**REQ:** SPEC §7  
**Type:** Integration / Android Instrumented  
**Framework:** Espresso

**Description:** After `VoxTTSModule.setVoice(voiceId)`, subsequent `speak()` calls use the selected voice.

**Preconditions:** At least one offline English voice available.

**Steps:**
1. Get voices via `getVoices()`
2. Call `setVoice(voices[0].id)`
3. Call `speak("test")`
4. Assert `tts.getVoice().name == voices[0].id`

**Pass criteria:** Active voice matches the requested voice ID

---

**ID:** IT-TTS-006  
**REQ:** SPEC §7  
**Type:** Integration / Android Instrumented  
**Framework:** Espresso

**Description:** `VoxTTSModule` emits `VoxTTSEvent` with prefix `"onDone"` when utterance completes naturally.

**Preconditions:** `NativeEventEmitter` listener attached.

**Steps:**
1. Call `module.speak("short text")`
2. Wait for utterance to finish
3. Assert at least one event string starts with `"onDone"`

**Pass criteria:** Event with `"onDone"` prefix received

---

**ID:** IT-TTS-007  
**REQ:** SPEC §7  
**Type:** Integration / Android Instrumented  
**Framework:** Espresso

**Description:** `VoxTTSModule.speak()` is a no-op (skipped, not crashed) if TTS is not yet initialised.

**Preconditions:** TTS initialisation delayed or mocked to stay in `STATUS_ERROR`.

**Steps:**
1. Call `module.speak("test")` before `ready == true`
2. Assert no crash, no exception thrown

**Pass criteria:** Method returns without throwing; no `onDone` event

---

**ID:** IT-TTS-008  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** TTSEngine 6 s watchdog resets `speaking` state when `onFinished` never fires.

**Preconditions:** TTSEngine with non-finishing mock backend

**Steps:**
1. `engine.handleTrigger({count: 1, maxLevel: Medium, isClear: false})`
2. Do not call `triggerFinished()`
3. Advance 6 001 ms

**Expected result:** `speaking` is reset; a new trigger is now accepted.

**Steps (continued):**
4. `engine.handleTrigger({count: 2, maxLevel: Medium, isClear: false})`
5. Assert `backend.lastUtterance === '2 vehicles, medium speed'`

**Pass criteria:** Second utterance accepted after watchdog fires

---

**ID:** IT-TTS-009  
**REQ:** REQ-AUD-003  
**Type:** Unit  
**Framework:** Jest

**Description:** `onAudioFocusLoss()` resets speaking state, allowing the next trigger to be accepted.

**Steps:**
1. `engine.handleTrigger({count: 1, ...})`
2. Call `engine.onAudioFocusLoss()`
3. `engine.handleTrigger({count: 2, ...})`
4. Assert `backend.lastUtterance === '2 vehicles, medium speed'`

**Pass criteria:** Focus loss treated as implicit speech end

---

**ID:** IT-TTS-010  
**REQ:** SPEC §7  
**Type:** Unit  
**Framework:** Jest

**Description:** `TTSEngine.speakImmediate()` interrupts current speech (used for Test Alert button).

**Steps:**
1. `engine.handleTrigger({count: 1, ...})` — speaking starts
2. Call `engine.speakImmediate("Test alert")`
3. Assert `backend.stop()` was called before the new `speak()` call

**Pass criteria:** `stopCalled === true`; new utterance is `"Test alert"`

---

## Section 6 — UI / E2E Tests

All UI tests use `@testing-library/react-native` (RNTL) unless specified otherwise. Device E2E tests use a physical or emulated Android device and are marked `[DEVICE]`.

---

### 6.1 Pairing Flow

---

**ID:** UI-PAI-001  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Pairing Step 1 renders correct progress indicator, VoxRider wordmark, Varia illustration, and Search button.

**Preconditions:** Render `PairingStep1` with mock `onSearch` and `onSkip` callbacks.

**Steps:**
1. Render `<PairingStep1 onSearch={jest.fn()} onSkip={jest.fn()} />`
2. Assert `testID="step-progress"` shows `"Step 1 of 2"`
3. Assert `testID="search-button"` exists and shows "Search"
4. Assert `testID="varia-illustration"` exists

**Pass criteria:** All three elements found with correct text

---

**ID:** UI-PAI-002  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Tapping Search button calls the `onSearch` callback.

**Steps:**
1. Render Step 1
2. `fireEvent.press(getByTestId('search-button'))`
3. Assert `onSearch` called once

**Pass criteria:** `onSearch.mock.calls.length === 1`

---

**ID:** UI-PAI-003  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Step 2 shows animated scanning indicator while scanning.

**Preconditions:** `bleManager.scan()` never resolves (hangs)

**Steps:**
1. Render `<PairingStep2 bleManager={mockBle} onConnected={jest.fn()} />`
2. Assert `testID="scanning-indicator"` exists

**Pass criteria:** Scanning indicator rendered

---

**ID:** UI-PAI-004  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Devices found in scan are sorted by RSSI (strongest first) and displayed as "Varia Radar" with raw ID underneath.

**Preconditions:** `bleManager.scan()` resolves with `[{rssi: -80, id: "AA", ...}, {rssi: -60, id: "BB", ...}]`

**Steps:**
1. Render Step 2; wait for scan to resolve
2. Assert `testID="device-list"` exists
3. Assert first `device-item` corresponds to the device with rssi -60 (stronger)

**Pass criteria:** Device order is RSSI descending

---

**ID:** UI-PAI-005  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Tapping a device connects and calls `onConnected`.

**Preconditions:** `bleManager.connect()` resolves immediately

**Steps:**
1. Render Step 2 with one found device
2. `fireEvent.press(getByTestId('device-item-AA'))`
3. Assert `onConnected` called

**Pass criteria:** `onConnected.mock.calls.length === 1`

---

**ID:** UI-PAI-006  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Connection error shows "Couldn't connect — tap to try again" message.

**Preconditions:** `bleManager.connect()` rejects

**Steps:**
1. Render Step 2 with one found device
2. Tap device
3. Assert `testID="connect-error"` appears with correct text

**Pass criteria:** Error text rendered

---

**ID:** UI-PAI-007  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** 30 s scan timeout shows "Varia not found" message and "Try again" button.

**Preconditions:** `bleManager.scan()` returns empty array after 30 s (mocked)

**Steps:**
1. Render Step 2; advance fake timers 30 001 ms
2. Assert `testID="timeout-message"` visible
3. Assert `testID="try-again-button"` visible

**Pass criteria:** Timeout UI elements rendered

---

**ID:** UI-PAI-008  
**REQ:** REQ-CON-001  
**Type:** UI  
**Framework:** RNTL

**Description:** "Try Again" button re-initiates the scan from a timeout state.

**Steps:**
1. Reach timeout state (UI-PAI-007)
2. `fireEvent.press(getByTestId('try-again-button'))`
3. Assert `testID="scanning-indicator"` reappears

**Pass criteria:** Scanning indicator visible after retry

---

**ID:** UI-PAI-009  
**REQ:** REQ-PER-001  
**Type:** UI  
**Framework:** RNTL

**Description:** When permission is denied, `PermissionBanner` renders and shows retry button.

**Preconditions:** Mock `useBluetoothPermission` to return `status: 'denied'`

**Steps:**
1. Render Step 2
2. Assert `testID="permission-banner"` visible
3. Assert `testID="permission-retry"` visible
4. Assert `testID="permission-open-settings"` NOT visible

**Pass criteria:** Banner and retry button shown; settings button absent

---

**ID:** UI-PAI-010  
**REQ:** REQ-PER-001  
**Type:** UI  
**Framework:** RNTL

**Description:** When permission is permanently blocked, `PermissionBanner` shows "Open Settings" button (not retry).

**Preconditions:** Mock `useBluetoothPermission` to return `status: 'blocked'`

**Steps:**
1. Render Step 2
2. Assert `testID="permission-open-settings"` visible
3. Assert `testID="permission-retry"` NOT visible

**Pass criteria:** Only settings button shown

---

### 6.2 Main Screen

---

**ID:** UI-MAIN-001  
**REQ:** REQ-VIS-003  
**Type:** UI  
**Framework:** RNTL

**Description:** Main screen renders all required regions when connected with no threats.

**Preconditions:** `radarStore` set to `Connected`, `connectedDevice: {name: "RTL64894"}`, `threats: []`, `batteryLevel: 75`

**Steps:**
1. Render `<MainScreen />`
2. Assert `testID="main-screen"` exists
3. Assert connection status text contains "Connected · RTL64894" (per `Strings.connected(deviceName)`)
4. Assert `testID="threat-label"` shows "All Clear"
5. Assert a battery level indicator is visible (battery bar or percentage)

**Pass criteria:** All elements present with correct device-name format and battery visible

---

**ID:** UI-MAIN-002  
**REQ:** REQ-VIS-003  
**Type:** UI  
**Framework:** RNTL

**Description:** Threat banner shows warning with count and speed label when threats are active.

**Preconditions:** `threats: [{level: High, distance: 40, speed: 0x82}]`

**Steps:**
1. Render `<MainScreen />`
2. Assert `testID="threat-label"` contains "1 vehicle" and "high speed"
3. Assert banner background is red (`#DC2626`)

**Pass criteria:** Warning text and red background present

---

**ID:** UI-MAIN-003  
**REQ:** REQ-CON-004  
**Type:** UI  
**Framework:** RNTL

**Description:** Conflict hint appears when `consecutiveFailures >= 3`.

**Preconditions:** `radarStore.consecutiveFailures = 3`

**Steps:**
1. Render `<MainScreen />`
2. Assert `testID="conflict-hint"` visible with text "Is another app connected to your Varia?"

**Pass criteria:** Hint rendered

---

**ID:** UI-MAIN-004  
**REQ:** REQ-CON-004  
**Type:** UI  
**Framework:** RNTL

**Description:** Conflict hint is hidden when `consecutiveFailures < 3`.

**Preconditions:** `radarStore.consecutiveFailures = 2`

**Steps:**
1. Render `<MainScreen />`
2. Assert `testID="conflict-hint"` NOT in tree

**Pass criteria:** `queryByTestId('conflict-hint')` returns null

---

**ID:** UI-MAIN-004B  
**REQ:** REQ-CON-002  
**Type:** UI  
**Framework:** RNTL

**Description:** When connection status is `Scanning` (auto-connect in progress), main screen header shows "Searching..." status text — not an error state.

**Preconditions:** `radarStore.connectionStatus = ConnectionStatus.Scanning`

**Steps:**
1. Render `<MainScreen />`
2. Assert header connection status text equals `Strings.searching` (`"Searching..."`)
3. Assert no error message or "disconnected" text present

**Pass criteria:** "Searching..." text rendered; no error state shown

---

**ID:** UI-MAIN-004C  
**REQ:** REQ-CON-001, REQ-CON-002  
**Type:** Integration  
**Framework:** Jest

**Description:** On first successful BLE connect, the app speaks `Strings.ttsRadarConnected` ("Radar connected"). This is the caller responsibility (not `ConnectionAlertEngine.onFirstConnect()`). Verify the app wiring fires TTS "Radar connected" on the first connect path.

**Preconditions:** Wired app instance with mock TTS speak; `ConnectionAlertEngine` and `TTSEngine.speakImmediate` connected.

**Steps:**
1. Simulate a successful `bleManager.connect()` from the pairing flow
2. Assert `speakImmediate("Radar connected")` (or equivalent speak call) was made

**Expected result:** TTS "Radar connected" spoken on first connect.

**Pass criteria:** Speak called with `Strings.ttsRadarConnected` === `"Radar connected"`

---

**ID:** UI-MAIN-005  
**REQ:** REQ-VIS-003  
**Type:** UI  
**Framework:** RNTL

**Description:** Swipe left gesture (>60 px horizontal, <80 px vertical) calls `onSwipeLeft`.

**Steps:**
1. Render `<MainScreen onSwipeLeft={jest.fn()} />`
2. Fire pan gesture with `translationX: -80, translationY: 10`
3. Assert `onSwipeLeft` called

**Pass criteria:** `onSwipeLeft.mock.calls.length === 1`

---

**ID:** UI-MAIN-006  
**REQ:** REQ-VIS-003  
**Type:** UI  
**Framework:** RNTL

**Description:** Swipe gesture with insufficient X or excessive Y does NOT call `onSwipeLeft`.

**Steps:**
1. Fire pan with `translationX: -50, translationY: 5` (too shallow)
2. Fire pan with `translationX: -80, translationY: 90` (too diagonal)
3. Assert `onSwipeLeft` never called

**Pass criteria:** `onSwipeLeft` not called in either case

---

**ID:** UI-MAIN-007  
**REQ:** SPEC §8.2  
**Type:** UI  
**Framework:** RNTL

**Description:** Debug section is hidden by default (debugMode = false).

**Preconditions:** `settingsStore.debugMode = false`

**Steps:**
1. Render `<MainScreen />`
2. Assert `testID="debug-simulate-button"` NOT in tree

**Pass criteria:** Debug section absent from render tree

---

**ID:** UI-MAIN-008  
**REQ:** REQ-DEV-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Debug section (simulator button + log panels) renders when `debugMode = true`.

**Preconditions:** `settingsStore.debugMode = true`

**Steps:**
1. Render `<MainScreen />`
2. Assert `testID="debug-simulate-button"` visible
3. Button text is "Simulate Threats"

**Pass criteria:** Debug button rendered with correct label

---

**ID:** UI-MAIN-009  
**REQ:** REQ-DEV-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Tapping "Simulate Threats" starts the simulator and button label changes to "Stop Simulation".

**Preconditions:** `debugMode = true`

**Steps:**
1. Render `<MainScreen />`
2. `fireEvent.press(getByTestId('debug-simulate-button'))`
3. Assert button text changes to "Stop Simulation"
4. `fireEvent.press(getByTestId('debug-simulate-button'))`
5. Assert text reverts to "Simulate Threats"

**Pass criteria:** Toggle works correctly

---

### 6.3 Settings Panel

---

**ID:** UI-SET-001  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Settings panel renders all expected controls.

**Steps:**
1. Render `<SettingsPanel onClose={jest.fn()} onAddDevice={jest.fn()} onRemoveDevice={jest.fn()} />`
2. Assert: `testID="verbosity-control"`, `testID="units-control"`, `testID="report-bug-button"` all present

**Pass criteria:** All three controls rendered

---

**ID:** UI-SET-002  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Selecting "Balanced" verbosity calls `setVerbosity('balanced')` in the store.

**Steps:**
1. Render Settings panel
2. `fireEvent.press(getByTestId('verbosity-balanced'))`
3. Assert `settingsStore.verbosity === 'balanced'`

**Pass criteria:** Store value updated

---

**ID:** UI-SET-003  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Selecting "Metric" units calls `setUnits('metric')`.

**Steps:**
1. Render Settings panel
2. `fireEvent.press(getByTestId('units-metric'))`
3. Assert `settingsStore.units === 'metric'`

**Pass criteria:** Store value updated

---

**ID:** UI-SET-004  
**REQ:** SPEC §8.4 (Announcer Voice — Android only)  
**Type:** UI  
**Framework:** RNTL

**Description:** Announcer voice dropdown is rendered on Android; absent on iOS.

**Steps:**
1. Set `Platform.OS = 'android'`; render Settings; assert `testID="voice-dropdown-trigger"` present
2. Set `Platform.OS = 'ios'`; render Settings; assert `testID="voice-dropdown-trigger"` absent

**Pass criteria:** Conditional rendering matches platform

---

**ID:** UI-SET-005  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Selecting a voice in the modal calls `setVoiceId`, invokes `VoxTTS.setVoice()`, and plays a preview utterance.

**Preconditions:** `NativeModules.VoxTTS` mocked

**Steps:**
1. Press `testID="voice-dropdown-trigger"`
2. Press `testID="voice-option-echo"`
3. Assert `NativeModules.VoxTTS.setVoice` called with Echo's voice ID
4. Assert `NativeModules.VoxTTS.speak` called with `"1 vehicle, medium speed"`

**Pass criteria:** Both native calls made

---

**ID:** UI-SET-006  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** "No devices paired" message shown when `pairedDevices` is empty.

**Preconditions:** `settingsStore.pairedDevices = []`

**Steps:**
1. Render Settings panel
2. Assert `testID="no-devices-text"` visible with "No devices paired"
3. Assert `testID="add-device-button"` visible

**Pass criteria:** Both elements present

---

**ID:** UI-SET-007  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Device row renders for each paired device; tapping Remove calls `onRemoveDevice`.

**Preconditions:** `pairedDevices = [{id: "TEST-001", name: "RTL515"}]`

**Steps:**
1. Render Settings
2. Assert `testID="device-row-TEST-001"` present
3. `fireEvent.press(getByTestId('remove-device-TEST-001'))`
4. Assert `onRemoveDevice` called with `"TEST-001"`

**Pass criteria:** Remove callback fired with correct device ID

---

**ID:** UI-SET-008  
**REQ:** SPEC §8.5  
**Type:** UI  
**Framework:** RNTL

**Description:** Tapping "Report a Bug" opens a pre-filled GitHub issue URL via `Linking.openURL`.

**Steps:**
1. Mock `Linking.openURL`
2. `fireEvent.press(getByTestId('report-bug-button'))`
3. Assert `Linking.openURL` called with a URL starting with `https://github.com/nav1885/VoxRider/issues/new`

**Pass criteria:** `openURL` called with correct GitHub base URL

---

**ID:** UI-SET-009  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Traffic Mode control visible only when `debugMode = true`.

**Steps:**
1. `debugMode = false` → assert `testID="traffic-mode-control"` absent
2. `debugMode = true` → assert `testID="traffic-mode-control"` present

**Pass criteria:** Conditional on debugMode

---

**ID:** UI-SET-010  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Close button calls `onClose`.

**Steps:**
1. Render Settings
2. `fireEvent.press(getByTestId('settings-close'))`
3. Assert `onClose` called once

**Pass criteria:** `onClose.mock.calls.length === 1`

---

### 6.4 Debug Mode Easter Egg

---

**ID:** UI-DEV-001  
**REQ:** SPEC §8.4 (Debug mode via 7 taps)  
**Type:** UI  
**Framework:** RNTL

**Description:** Seven taps on the VOXRIDER wordmark within the implementation's tap window enables debug mode and shows `·DEV·` badge.

**Spec note:** SPEC §8.4 specifies a 4-second window; `DebugWordmark.tsx` implements `DEBUG_TAP_WINDOW_MS = 8000`. This test covers the implemented behaviour (8 s). The discrepancy is tracked as a known spec drift — update this test if the code is corrected to 4 s.

**Preconditions:** `settingsStore.debugMode = false`

**Steps:**
1. Render a component containing `<DebugWordmark color="#000" />`
2. Fire 7 tap gestures within a simulated 8 s window
3. Assert `settingsStore.debugMode === true`
4. Assert `·DEV·` badge text is visible in the render tree

**Pass criteria:** Debug mode enabled; badge rendered

---

**ID:** UI-DEV-001B  
**REQ:** SPEC §8.4  
**Type:** Unit (Spec-compliance probe)  
**Framework:** Jest

**Description:** Compliance check — 7 taps within the spec-mandated 4-second window MUST enable debug mode. This test is currently expected to FAIL because the implementation uses an 8 s window. It exists to surface the spec drift.

**Steps:**
1. Render `<DebugWordmark />`; note: `DEBUG_TAP_WINDOW_MS = 8000` in implementation
2. Fire 7 taps at t=0, t=500, t=1000, t=1500, t=2000, t=2500, t=3000 (all within 4 s)
3. Assert `settingsStore.debugMode === true`

**Expected result (spec):** Debug enabled. **Current code result:** Debug enabled (since 8 s > 4 s, all taps still within window). NOTE: this test would FAIL if taps are between 4–8 s — add that sub-case as a separate regression when the code is fixed.

**Pass criteria (tracking):** Add explicit comment in test that this must also pass with a 4 s `DEBUG_TAP_WINDOW_MS`

---

**ID:** UI-DEV-002  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Fewer than 7 taps (e.g., 6) do NOT enable debug mode.

**Steps:**
1. Render `<DebugWordmark />` with `debugMode = false`
2. Fire 6 tap gestures
3. Assert `settingsStore.debugMode === false`

**Pass criteria:** Debug mode unchanged

---

**ID:** UI-DEV-003  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** Tap counter resets when the tap window expires between taps. Uses the implemented window (8 s).

**Steps:**
1. Fire 5 taps
2. Advance fake timers 8 001 ms (window expires)
3. Fire 7 more taps
4. Assert `debugMode === true` (fresh 7-tap sequence succeeds)

**Pass criteria:** Debug mode enabled only after the fresh 7-tap sequence

---

**ID:** UI-DEV-004  
**REQ:** SPEC §8.4  
**Type:** UI  
**Framework:** RNTL

**Description:** When `debugMode = true`, 5 taps within 8 s disables debug mode and hides `·DEV·` badge.

**Preconditions:** `settingsStore.debugMode = true`

**Steps:**
1. Render `<DebugWordmark />`
2. Fire 5 taps within 8 s
3. Assert `settingsStore.debugMode === false`
4. Assert `·DEV·` badge not in tree

**Pass criteria:** Debug disabled; badge hidden

---

**ID:** UI-DEV-005  
**REQ:** SPEC §8.4  
**Type:** UI / Platform  
**Framework:** RNTL + Android mock

**Description:** On Android, enabling debug mode shows a `ToastAndroid.SHORT` toast with "Debug mode enabled".

**Preconditions:** `Platform.OS = 'android'`; spy on `ToastAndroid.show`

**Steps:**
1. Spy on `ToastAndroid.show`
2. Fire 7 taps on wordmark
3. Assert `ToastAndroid.show` called with `"Debug mode enabled"` and `ToastAndroid.SHORT`

**Pass criteria:** Toast call matches expected arguments

---

### 6.5 Threat Display and Radar Strip

---

**ID:** UI-RAD-001  
**REQ:** REQ-VIS-001  
**Type:** UI  
**Framework:** RNTL

**Description:** `RadarStrip` background is green when no threats are present.

**Preconditions:** `threats: []`

**Steps:**
1. Render `<RadarStrip threats={[]} />`
2. Assert container background color is `#16A34A` (dark mode green)

**Pass criteria:** Background color correct for clear state

---

**ID:** UI-RAD-002  
**REQ:** REQ-VIS-001  
**Type:** UI  
**Framework:** RNTL

**Description:** `RadarStrip` background is orange for medium-speed threat.

**Preconditions:** `threats: [{level: Medium, distance: 80, speed: 0x44}]`

**Steps:**
1. Render strip
2. Assert container background is `#EA6B0D` (dark mode orange)

**Pass criteria:** Orange background for medium level

---

**ID:** UI-RAD-003  
**REQ:** REQ-VIS-001  
**Type:** UI  
**Framework:** RNTL

**Description:** `RadarStrip` background is red for high-speed threat.

**Preconditions:** `threats: [{level: High, distance: 40, speed: 0x82}]`

**Steps:**
1. Render strip
2. Assert container background is `#DC2626` (dark mode red)

**Pass criteria:** Red background for high level

---

**ID:** UI-RAD-004  
**REQ:** REQ-VIS-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Unknown threat level renders with orange background (treated as Medium — conservative).

**Preconditions:** `threats: [{level: Unknown, distance: 80, speed: 0xC0}]`

**Steps:**
1. Render strip
2. Assert background is orange (`#EA6B0D`)

**Pass criteria:** Orange background (Unknown treated conservatively as Medium)

---

**ID:** UI-RAD-005  
**REQ:** REQ-VIS-001  
**Type:** UI  
**Framework:** RNTL

**Description:** Multiple vehicles each rendered at distinct vertical positions corresponding to their distance.

**Preconditions:** `threats: [{distance: 30, level: High}, {distance: 120, level: Medium}]`

**Steps:**
1. Render strip with 2 threats
2. Assert 2 car icon elements present
3. Assert the high-speed icon is positioned closer to top (lower distance = top of strip)

**Pass criteria:** Two icons rendered; ordering correct

---

### 6.6 Audio Alerts — User-Facing

---

**ID:** UI-AUD-000  
**REQ:** REQ-VIS-003  
**Type:** UI  
**Framework:** RNTL

**Description:** Test Alert button is present on the main screen. This test is a **spec compliance probe** — it will FAIL today because `MainScreen.tsx` does not yet render a Test Alert button (`testID="test-alert-button"`). The test exists to surface this implementation gap.

**Implementation gap:** SPEC §8.2 (REQ-VIS-003) explicitly lists `[ Test Alert ]` in the main screen layout. The current `MainScreen.tsx` renders: `AppHeader`, `banner`, `RoadView`, conflict hint, and debug section — no Test Alert button. This is a missing feature.

**Steps:**
1. Render `<MainScreen />` with radar connected
2. Assert `testID="test-alert-button"` is in the render tree

**Expected result (spec):** Button present.  
**Current code result:** FAIL — button not rendered.

**Pass criteria:** Test passes once Test Alert button is implemented in MainScreen.

---

**ID:** UI-AUD-001  
**REQ:** REQ-AUD-002  
**Type:** UI / E2E — `[DEVICE]`  
**Framework:** Manual on physical Android device

**Description:** Test Alert button fires a sample TTS to verify earbuds before riding.

**Preconditions:** Android device with earbuds connected; app on main screen; radar connected.

**Steps:**
1. Navigate to main screen
2. Locate and tap the Test Alert button
3. Listen to earbuds

**Expected result:** TTS speaks a sample utterance ("1 vehicle, medium speed") through the earbuds within 1 s.

**Pass criteria:** Audible alert heard through earbuds within 1 s; no crash

---

**ID:** UI-AUD-002  
**REQ:** REQ-AUD-001  
**Type:** E2E — `[DEVICE]`  
**Framework:** Manual

**Description:** Music ducks during TTS alert (AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).

**Preconditions:** Music playing at ~50% volume via Spotify or YouTube Music; app running.

**Steps:**
1. Start music
2. Trigger a TTS alert (use debug simulator in Busy mode)
3. Observe audio

**Expected result:** Music volume reduces noticeably during TTS utterance; music returns to original volume after TTS completes.

**Pass criteria:** Audible ducking observed; music recovers after TTS finishes

---

**ID:** UI-AUD-003  
**REQ:** REQ-AUD-003  
**Type:** E2E — `[DEVICE]`  
**Framework:** Manual

**Description:** Spoken alert is never cut off mid-sentence by a subsequent alert.

**Preconditions:** Debug simulator running in Very Busy mode.

**Steps:**
1. Enable debug mode; start simulator in "Very Busy"
2. Observe audio for 2 minutes
3. Listen for any clipped or truncated utterances

**Expected result:** Every utterance completes in full before the next begins.

**Pass criteria:** No clipping or truncation observed in any utterance

---

## Section 7 — Platform-Specific Android Tests

### 7.1 Foreground Service Persistence

---

**ID:** PL-SVC-001  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual / ADB

**Description:** RadarService shows a persistent low-priority notification while active.

**Preconditions:** App launched; BLE connection established.

**Steps:**
1. Pull down notification shade
2. Observe VoxRider notification

**Expected result:** "VoxRider active" notification visible; no sound; no heads-up.

**Pass criteria:** Notification present with IMPORTANCE_LOW behaviour (silent, persistent)

---

**ID:** PL-SVC-002  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** ADB + Manual

**Description:** RadarService restarts automatically (`START_STICKY`) after being killed by the OS.

**Preconditions:** App backgrounded; RadarService running.

**Steps:**
1. `adb shell am kill com.nav1885.voxrider` (kills the process)
2. Wait 10 s
3. Check `adb shell dumpsys activity services | grep RadarService`

**Expected result:** RadarService entry reappears in dumpsys output.

**Pass criteria:** Service restarted by OS within 15 s

---

**ID:** PL-SVC-003  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** Foreground service declared with correct service types for API 34+ — `connectedDevice | mediaPlayback`.

**Preconditions:** Device on Android 14+ (API 34+).

**Steps:**
1. Run `adb shell dumpsys activity services | grep -A5 RadarService`
2. Confirm `foregroundServiceType` contains both `connectedDevice` and `mediaPlayback`

**Expected result:** Both service types present.

**Pass criteria:** Both types confirmed in dumpsys output

---

**ID:** PL-SVC-004  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** ADB + Manual

**Description:** `PARTIAL_WAKE_LOCK` is held by RadarService while running, preventing CPU sleep during background BLE reconnect.

**Preconditions:** App backgrounded; screen locked.

**Steps:**
1. `adb shell dumpsys power | grep -i voxrider`
2. Confirm `VoxRider::RadarWakeLock` is listed as held

**Expected result:** Wake lock is active.

**Pass criteria:** Wake lock appears in power dumpsys output

---

**ID:** PL-SVC-005  
**REQ:** SPEC §13 (API 26 minimum)  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** On Android 8.0 (API 26), service starts via `startForeground()` correctly without `startForegroundService()` crash.

**Preconditions:** Test device or emulator running API 26.

**Steps:**
1. Install APK on API 26 device
2. Grant permissions, connect to Varia
3. Background the app

**Expected result:** App remains connected; no ForegroundServiceStartNotAllowedException.

**Pass criteria:** App functions normally on API 26; no crash in logcat

---

### 7.2 Audio Focus

---

**ID:** PL-AUD-001  
**REQ:** SPEC §7 (Audio Focus), REQ-AUD-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** ADB + Manual

**Description:** On API 26+, `AudioFocusRequest` is used with `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`; no deprecated `requestAudioFocus(null, ...)` call.

**Preconditions:** Android 8.0+ device.

**Steps:**
1. Enable logcat filter: `adb logcat -s VoxTTS:D`
2. Trigger a TTS alert
3. Inspect logs for `requestAudioFocus` call parameters

**Expected result:** Focus type is `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`; `AudioFocusRequest.Builder` used.

**Pass criteria:** Correct focus type logged; no deprecated API warnings

---

**ID:** PL-AUD-002  
**REQ:** REQ-AUD-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** On API 25 and below, deprecated `AudioManager.requestAudioFocus(null, STREAM_MUSIC, AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)` is used without crashing.

**Preconditions:** Device or emulator running API ≤25.

**Steps:**
1. Install APK
2. Trigger TTS
3. Confirm audio ducking occurs; no ANR or crash

**Pass criteria:** App functions; no crash

---

**ID:** PL-AUD-003  
**REQ:** REQ-AUD-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** TTS audio is routed to Bluetooth earbuds (not phone speaker) when earbuds are connected.

**Preconditions:** Bluetooth earbuds connected to Android device.

**Steps:**
1. Connect earbuds
2. Trigger TTS alert
3. Verify audio heard through earbuds, not phone speaker

**Expected result:** TTS routes via `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` to the active Bluetooth audio output.

**Pass criteria:** Alert audible in earbuds only

---

**ID:** PL-AUD-004  
**REQ:** REQ-AUD-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** Incoming phone call: TTS defers to the phone call audio focus OS policy and does not fight for focus.

**Preconditions:** SIM card in device; Varia connected.

**Steps:**
1. Trigger debug simulator in Busy mode
2. Receive an incoming phone call
3. Accept call, speak for 30 s, hang up
4. Confirm TTS resumes after call

**Expected result:** TTS does not play during the phone call; resumes after call ends.

**Pass criteria:** No TTS heard during call; normal operation after hang-up

---

### 7.3 Background BLE

---

**ID:** PL-BLE-001  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** BLE characteristic notifications continue to arrive when screen is locked.

**Preconditions:** Varia connected; screen on with debug log visible.

**Steps:**
1. Confirm packets arriving in ALG log on main screen
2. Lock phone screen
3. Unlock after 2 minutes; inspect ALG/TTS debug log

**Expected result:** Log shows continued packet receipt and alert evaluations during screen lock.

**Pass criteria:** Entries continue in debug log without gap > 5 s

---

**ID:** PL-BLE-002  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** App auto-connects to remembered Varia on subsequent launch without showing pairing UI.

**Preconditions:** Device was previously paired; Varia powered on.

**Steps:**
1. Force-stop app
2. Relaunch app
3. Observe initial screen

**Expected result:** Main screen shown immediately; TTS announces "Radar connected" within 10 s; pairing flow NOT shown.

**Pass criteria:** No pairing screen; "Radar connected" heard

---

**ID:** PL-BLE-003  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual + Stopwatch

**Description:** After BLE drop, reconnect attempt starts within 3 s and succeeds when Varia is back in range.

**Preconditions:** Varia connected; app in foreground.

**Steps:**
1. Power off Varia; start stopwatch
2. Wait for "Radar disconnected" TTS
3. Note time elapsed from disconnect to TTS announcement
4. Power Varia back on
5. Wait for "Radar reconnected" TTS

**Expected result:** "Radar disconnected" within 5 s; reconnect attempt begins within 3 s; "Radar reconnected" spoken on recovery.

**Pass criteria:** Disconnect TTS < 5 s; reconnect TTS fires on Varia power-on

---

**ID:** PL-BLE-004  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual + Stopwatch

**Description:** Fast reconnect (every 3 s) for first 60 s after disconnect; slow reconnect (every 10 s) thereafter.

**Steps:**
1. Disconnect Varia for 65 s (leave off)
2. Reconnect Varia
3. Observe time-to-reconnect TTS announcement

**Expected result:** After 60 s in disconnected state, retry interval switches to 10 s. When Varia is powered back on after the 60 s window, reconnect occurs within 10 s.

**Pass criteria:** Reconnect announced within 10 s of Varia becoming available after the 60 s window

---

**ID:** PL-BLE-005  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** 3-hour endurance: BLE connection maintained for full ride duration.

**Preconditions:** Varia fully charged; phone charged; full ride conditions.

**Steps:**
1. Connect Varia; start ride timer
2. Ride or leave stationary for 3 hours; screen locked
3. At T+3h, unlock phone

**Expected result:** Connection status shows Connected; no spurious disconnects in debug log.

**Pass criteria:** Connection maintained for ≥ 3 h without manual intervention

---

### 7.4 Android Doze Survival

---

**ID:** PL-DOZ-001  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** ADB

**Description:** App survives Android Doze mode and continues BLE + TTS operations.

**Preconditions:** App connected; device unplugged (Doze requires battery + stationary).

**Steps:**
1. Unplug device; set it stationary
2. Force Doze: `adb shell dumpsys deviceidle force-idle`
3. Wait 5 minutes; send test threat via debug simulator (if possible via `adb shell`)
4. Exit Doze: `adb shell dumpsys deviceidle unforce`
5. Check that reconnection and alert announcements resume

**Expected result:** After Doze exit, BLE resumes and alerts fire normally.

**Pass criteria:** No permanent disconnection after Doze cycle

---

**ID:** PL-DOZ-002  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** ADB + Manual

**Description:** Battery optimization exemption: when the app is in the "unrestricted" battery bucket, background BLE does not drop during idle.

**Preconditions:** App exempted from battery optimization (Settings → Apps → VoxRider → Battery → Unrestricted).

**Steps:**
1. Exempt app from battery optimization
2. Lock phone for 30 minutes
3. Unlock; verify Varia still shows Connected

**Expected result:** Connection maintained throughout 30-minute idle period.

**Pass criteria:** Connected on unlock; no reconnect TTS heard

---

**ID:** PL-DOZ-003  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** When battery optimization is NOT disabled, the battery optimization banner appears.

**Preconditions:** App NOT exempted from battery optimization on Android 8+.

**Steps:**
1. Revoke battery optimization exemption
2. Launch app
3. Observe main screen

**Expected result:** Banner with text "Battery restriction detected — radar may disconnect during rides" and "Fix this" button visible.

**Pass criteria:** Banner present with correct text and button

---

**ID:** PL-DOZ-004  
**REQ:** REQ-CON-003  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** Tapping "Fix this" on the battery banner opens the system battery optimization settings for VoxRider.

**Steps:**
1. Display battery banner (see PL-DOZ-003)
2. Tap "Fix this"

**Expected result:** System Settings app opens to the Battery Optimization screen for VoxRider.

**Pass criteria:** Correct system screen opened

---

### 7.5 BLE Permissions — API 31+ vs ≤30

---

**ID:** PL-PER-001  
**REQ:** REQ-PER-001  
**Type:** Platform  
**Framework:** Jest (Unit) + Manual device verification

**Description:** On Android 12+ (API 31+), `requestMultiple([BLUETOOTH_SCAN, BLUETOOTH_CONNECT])` is called — NOT `ACCESS_FINE_LOCATION`.

**Preconditions:** Mock `Platform.Version = 31`

**Steps (Unit):**
1. Mock `PermissionsAndroid.requestMultiple` to return both GRANTED
2. Call `useBluetoothPermission().request()`
3. Assert `requestMultiple` called with `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`
4. Assert `PermissionsAndroid.request` (for location) NOT called

**Pass criteria:** `requestMultiple` called; `request` not called

---

**ID:** PL-PER-002  
**REQ:** REQ-PER-001  
**Type:** Platform  
**Framework:** Jest (Unit) + Manual device verification

**Description:** On Android 11 and below (API ≤30), `request(ACCESS_FINE_LOCATION)` is called — NOT the BLUETOOTH_* permissions.

**Preconditions:** Mock `Platform.Version = 30`

**Steps (Unit):**
1. Mock `PermissionsAndroid.request` to return GRANTED
2. Call `useBluetoothPermission().request()`
3. Assert `request` called with `ACCESS_FINE_LOCATION`

**Pass criteria:** `request(ACCESS_FINE_LOCATION)` called; result is `'granted'`

---

**ID:** PL-PER-003  
**REQ:** REQ-PER-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** Pre-dialog rationale is shown before the system Bluetooth permission dialog on Android 12+.

**Preconditions:** Fresh install on Android 12+ device; permissions not yet granted.

**Steps:**
1. Install APK; launch app
2. Proceed to Step 2 of pairing

**Expected result:** App shows the rationale text "VoxRider needs Bluetooth access to connect to your Varia radar. On older Android versions this also requires location permission — your location is never stored or shared." before the system dialog.

**Pass criteria:** Rationale text visible prior to OS dialog

---

**ID:** PL-PER-004  
**REQ:** REQ-PER-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** When Bluetooth permission is denied (not permanently), a plain-language explanation with an "Open Settings" button appears.

**Steps:**
1. Deny the Bluetooth permission dialog
2. Observe UI

**Expected result:** `PermissionBanner` renders with "Open Settings" button.

**Pass criteria:** Banner and button visible

---

**ID:** PL-PER-005  
**REQ:** REQ-PER-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** AndroidManifest declares `BLUETOOTH_SCAN` with `neverForLocation` flag on API 31+ — location permission is NOT required for BLE scanning on API 31+.

**Preconditions:** Android 12+ device; new install.

**Steps:**
1. Grant `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` only
2. Attempt BLE scan in Step 2 of pairing
3. Confirm scan proceeds without requesting location

**Expected result:** Scan works without location permission prompt.

**Pass criteria:** No location permission dialog shown; devices found

---

**ID:** PL-PER-006  
**REQ:** REQ-PER-001  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** On Android 13+ (API 33+), `POST_NOTIFICATIONS` permission is required to display the foreground service notification. Verify it is requested.

**Preconditions:** Android 13+ device; notification permission not yet granted.

**Steps:**
1. Launch app on Android 13+
2. Observe whether notification permission dialog appears or notification is shown

**Expected result:** App requests `POST_NOTIFICATIONS` and notification appears in shade.

**Pass criteria:** Notification visible in shade after permission granted

---

### 7.6 Dark Theme Enforcement

---

**ID:** PL-UI-001  
**REQ:** SPEC §14 (UI Constraints)  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** App always renders in dark mode regardless of system light/dark setting.

**Preconditions:** Device system theme set to Light.

**Steps:**
1. Set device to Light theme
2. Launch VoxRider
3. Observe app background colour on all screens (Main, Pairing Step 1, Step 2, Settings)

**Expected result:** All screens render with dark background (`#111827`) regardless of system theme.

**Pass criteria:** No screen shows a white or light background

---

**ID:** PL-UI-002  
**REQ:** SPEC §14  
**Type:** UI  
**Framework:** RNTL

**Description:** Main screen renders dark background (`#111827`) even when system `useColorScheme` returns `'light'`.

**Preconditions:** Mock `useColorScheme` to return `'light'`

**Steps:**
1. Render `<MainScreen />`
2. Assert container background is `#111827`

**Pass criteria:** Dark background applied regardless of mock scheme value

---

**ID:** PL-UI-003  
**REQ:** SPEC §14  
**Type:** Platform — `[DEVICE]`  
**Framework:** Manual

**Description:** Portrait orientation is locked — rotating the device does not rotate the UI.

**Steps:**
1. Launch app on any screen
2. Rotate device to landscape

**Expected result:** UI remains in portrait; no layout change.

**Pass criteria:** App stays portrait after rotation

---

## Section 8 — Regression and Edge Cases

---

**ID:** REG-001  
**REQ:** SPEC §7 — critical bug fix  
**Type:** Unit  
**Framework:** Jest

**Description:** Protocol constant regression: the lower nibble `0x2` of the header byte must never be misread as threat count. Specifically, a 4-byte single-threat packet with `0x82` header must NOT be dropped as a fragment.

**Steps:**
1. `parseRadarPacket(new Uint8Array([0x82, 0xAE, 0x2B, 0x44]))`
2. Assert result is not null
3. Assert `threats.length === 1`

**Pass criteria:** `result !== null && result.threats.length === 1`

---

**ID:** REG-002  
**REQ:** REQ-AUD-002, REQ-AUD-003 — regression observed 2026-04-06  
**Type:** Unit  
**Framework:** Jest

**Description:** After a clear is announced (lastSpoken resets to 0), a new car is correctly announced even though its count (1) matches the old pre-clear lastSpoken count.

**Steps:**
1. `lastSpokenState.count = 1` (simulate: car announced)
2. Evaluate `[]` → advance 1 501 ms → clear fires → call `speak(clearTrigger)` → lastSpoken = 0
3. Evaluate `[mediumThreat]`
4. Advance 751 ms

**Expected result:** New car trigger fires with `count: 1`.

**Pass criteria:** `fired` contains a third element with `count: 1, isClear: false`

---

**ID:** REG-003  
**REQ:** REQ-AUD-002 — clear debounce regression  
**Type:** Unit  
**Framework:** Jest

**Description:** When a new threat arrives while the clear debounce is still running (not yet fired), the clear debounce cancels AND resets lastSpoken to 0, so the new threat is announced.

**Steps:**
1. `lastSpokenState.count = 1`
2. Evaluate `[]` — clear debounce starts (timer NOT yet elapsed)
3. Evaluate `[mediumThreat]` — new car arrives during debounce
4. Advance 751 ms

**Expected result:** Alert fires with `count: 1`.

**Pass criteria:** Trigger fires; `isClear === false`

---

**ID:** REG-004  
**REQ:** SPEC §7 — ThreatHoldover  
**Type:** Unit  
**Framework:** Jest

**Description:** VehicleTracker "2 cars from 1" phantom: a single car that drops out and reappears at a different distance is never seen as 2 cars.

**Steps:**
1. `holdover.feed([med(80)])` — stable 1 car
2. `holdover.feed([])` × 2 — BLE dropout
3. `holdover.feed([med(50)])` — car reappears at new distance

**Expected result:** No update ever has `length > 1`.

**Pass criteria:** `updates.every(u => u.length <= 1)`

---

## Appendix A — Test Matrix Summary

| Test ID Range | Category | Framework | Count |
|---|---|---|---|
| UT-ALE-001 – UT-ALE-020 | Alert Engine | Jest | 20 |
| UT-PKT-001 – UT-PKT-010 | Packet Parser | Jest | 10 |
| UT-HLD-001 – UT-HLD-008 | ThreatHoldover | Jest | 8 |
| UT-BLE-001 – UT-BLE-003 | Alert Messages | Jest | 3 |
| IT-PIPE-001 – IT-PIPE-010 | BLE Pipeline | Jest | 10 |
| IT-TTS-001 – IT-TTS-010 | VoxTTSModule / TTSEngine | Jest + Espresso | 10 |
| UI-PAI-001 – UI-PAI-010 | Pairing Flow | RNTL | 10 |
| UI-MAIN-001 – UI-MAIN-004C | Main Screen | RNTL + Jest | 11 |
| UI-SET-001 – UI-SET-010 | Settings Panel | RNTL | 10 |
| UI-DEV-001 – UI-DEV-005 (incl. UI-DEV-001B) | Debug Easter Egg | RNTL | 6 |
| UI-RAD-001 – UI-RAD-005 | Radar Strip | RNTL | 5 |
| UI-AUD-000 – UI-AUD-003 | Audio Alerts | RNTL + Manual [DEVICE] | 4 |
| PL-SVC-001 – PL-SVC-005 | Foreground Service | ADB + Manual | 5 |
| PL-AUD-001 – PL-AUD-004 | Audio Focus | ADB + Manual | 4 |
| PL-BLE-001 – PL-BLE-005 | Background BLE | Manual | 5 |
| PL-DOZ-001 – PL-DOZ-004 | Doze Survival | ADB + Manual | 4 |
| PL-PER-001 – PL-PER-006 | BLE Permissions | Jest + Manual | 6 |
| PL-UI-001 – PL-UI-003 | Dark Theme / Orientation | RNTL + Manual | 3 |
| REG-001 – REG-004 | Regressions | Jest | 4 |
| **Total** | | | **139** |

---

## Appendix B — Test Environment Requirements

### Automated Tests (Jest + RNTL)

| Requirement | Version / Notes |
|---|---|
| Node.js | 18+ |
| Jest | Configured in project `package.json` |
| `@testing-library/react-native` | 12+ |
| `jest.useFakeTimers()` | Required for all debounce/timer tests |
| `react-native-gesture-handler` mock | Included in project mocks |
| `react-native-ble-plx` mock | `/src/__mocks__/react-native-ble-plx.js` |

### Android Instrumented Tests (Espresso / Robolectric)

| Requirement | Version / Notes |
|---|---|
| Android Studio | Ladybug or newer |
| Kotlin | 1.9+ |
| Android Gradle Plugin | 8.x |
| Test device minimum API | 26 |
| Test device target API | 34 (for foreground service type tests) |

### Device Tests (`[DEVICE]`)

| Requirement | Notes |
|---|---|
| Physical Android device | Pixel 7 or Samsung S24 recommended for Doze testing |
| Garmin Varia RTL515 | Required for all Varia BLE tests |
| Bluetooth earbuds | Required for audio ducking tests |
| ADB USB debugging | Required for service and Doze tests |
| Android API 26 device | For minimum-API service start test (PL-SVC-005) |
| Android API 31+ device | For BLUETOOTH_SCAN permission path (PL-PER-001, PL-PER-005) |
| Android API 33+ device | For POST_NOTIFICATIONS test (PL-PER-006) |
| Android API 34 device | For foreground service type tests (PL-SVC-003) |

---

## Appendix C — Requirement Cross-Reference

| Requirement | Tests |
|---|---|
| REQ-CON-001 (First-time pairing) | UI-PAI-001 – UI-PAI-008 |
| REQ-CON-002 (Auto-connect) | PL-BLE-002 |
| REQ-CON-003 (Reconnect reliability) | IT-PIPE-008 – IT-PIPE-010, PL-SVC-001 – PL-SVC-005, PL-BLE-001 – PL-BLE-005, PL-DOZ-001 – PL-DOZ-004, UT-ALE-020 |
| REQ-CON-004 (Conflict warning) | UI-MAIN-003, UI-MAIN-004 |
| REQ-VIS-001 (Radar strip) | UI-RAD-001 – UI-RAD-005 |
| REQ-VIS-003 (Main screen layout) | UI-MAIN-001 – UI-MAIN-006 |
| REQ-AUD-001 (TTS precedence / audio focus) | PL-AUD-001 – PL-AUD-004, IT-TTS-002 – IT-TTS-003 |
| REQ-AUD-002 (Trigger conditions) | UT-ALE-001 – UT-ALE-013, IT-PIPE-001 – IT-PIPE-004, UI-AUD-001 |
| REQ-AUD-003 (Snapshot-on-completion) | UT-ALE-014 – UT-ALE-019, IT-PIPE-005 – IT-PIPE-006, IT-TTS-009, UI-AUD-003 |
| REQ-AUD-004 (Alert format) | UT-BLE-001 – UT-BLE-003 |
| REQ-PER-001 (Android BLE permissions) | UI-PAI-009 – UI-PAI-010, PL-PER-001 – PL-PER-006 |
| REQ-SET-007 (Bug report) | UI-SET-008 |
| REQ-DEV-001 (Debug Easter egg) | UI-DEV-001 – UI-DEV-005, UI-MAIN-007 – UI-MAIN-009 |

**Note on REQ-DEV-001:** SPEC §8.4 references "See REQ-DEV-001" but this requirement ID is not formally defined in SPEC.md v1.0. The associated behaviour (7-tap Easter egg unlocks debug mode; `·DEV·` badge; simulator panel) is fully described in §8.4 prose. Tests citing REQ-DEV-001 should be understood as referencing SPEC §8.4.
| SPEC §7 (BLE protocol) | UT-PKT-001 – UT-PKT-010, UT-HLD-001 – UT-HLD-008, REG-001 – REG-004 |
| SPEC §14 (Dark theme / portrait) | PL-UI-001 – PL-UI-003 |

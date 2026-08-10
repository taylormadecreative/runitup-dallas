# Run It UP! Apple Watch App — Design Spec

**Date:** 2026-08-10 · **Ships as:** v1.4 (after v1.3 clears review) · **Approved by Nelson:** yes (conversation, 8/10)

## Problem

Run It UP! tracks runs on iPhone only. Members who run with an Apple Watch have to carry a phone,
and the app can't offer heart rate, can't close Activity rings, and can't use the watch's
GPS+motion fusion (which is more accurate than raw phone GPS haversine).

## Goals (user-approved scope)

1. **Phone-free tracking.** The watch records a complete run on its own and the run uploads
   automatically the next time the phone is reachable — even if both apps were closed meanwhile.
2. **Run-only scope on the watch:** goal picker → live run → finish summary. No check-in, streaks,
   or leaderboard on the watch (explicitly deferred).
3. **All three feedback channels:** wrist haptics at milestones, spoken coach through connected
   AirPods, and large on-screen numbers.
4. **Apple Health:** each run saves as an HKWorkout so it closes Exercise/Move rings and appears in
   the Fitness app; heart rate and active calories come from Apple's engine.
5. Runs from the watch land in the existing phone history, stats, and leaderboard identically to
   phone runs.

Non-goals: watch complications, standalone Supabase auth/network on the watch, watch-side check-in,
Android/Wear OS, route map rendering on the watch, live phone↔watch metric mirroring during a run.

## Architecture

The watch tracks; the phone saves. The watch never talks to Supabase.

```
WATCH (independent watchOS app)            PHONE (existing Capacitor app)
┌───────────────────────────────┐          ┌──────────────────────────────────┐
│ WorkoutManager                │          │ WatchBridgePlugin (Swift, WCSession
│  HKWorkoutSession +           │          │   delegate) → emits 'watchRun'    │
│  HKLiveWorkoutBuilder         │          │                ↓                  │
│  HKWorkoutRouteBuilder + CL   │  Watch   │ js/watch-sync.js                  │
│    ↓ miles/time/pace/HR       │ Connect- │   builds payload, reuses          │
│ RunMilestones (pure)          │  ivity   │   _saveRunPayload/_addPendingRun  │
│ CoachFeedback (haptics/speech)│ ───────▶ │                ↓                  │
│ PhoneSync (transferUserInfo)  │          │ save_run_with_checkin RPC         │
└───────────────────────────────┘          └──────────────────────────────────┘
```

**Why this split.** Standalone watch auth would mean signing into Supabase on a 1.9" screen plus a
new Swift network/session layer. Reusing the phone's save path costs one message hop and inherits
everything hardened on 2026-08-09: the idempotent `p_client_run_id` (generated on the *watch*, so a
handoff can be retried or delivered late without ever double-counting), the pending-run queue, and
the club-vs-solo event-type logic.

**Delivery guarantee.** `WCSession.transferUserInfo` queues FIFO, persists across app termination
and device reboot, and delivers when the counterpart becomes available. A phone-free run therefore
survives on the watch until the phone is next reachable. `sendMessage` is NOT used for run handoff
(it requires immediate reachability).

### watchOS target — `RunItUpWatch`

- Single-target watchOS app (Xcode 14+ style), bundle id `com.runitupdallas.app.watchkitapp`,
  `WKCompanionAppBundleIdentifier = com.runitupdallas.app`, deployment target **watchOS 10.0**
  (Apple Watch Series 4 and later), embedded in the iOS app via an "Embed Watch Content" phase.
- `WKRunsIndependentlyOfCompanionApp = true` — installable/launchable without opening the phone app.
- `WKBackgroundModes = [workout-processing]` — an active HKWorkoutSession is what keeps the app
  running with the wrist down; there is no separate "keep alive" hack.
- HealthKit entitlement on the watch target; `NSHealthShareUsageDescription`,
  `NSHealthUpdateUsageDescription`, `NSLocationWhenInUseUsageDescription` strings.
- App ID capability changes (HealthKit on the parent App ID, new watch Bundle ID) applied via the
  App Store Connect API (`/bundleIds`, `/bundleIdCapabilities`) if automatic signing doesn't.

**Files (one responsibility each):**

| File | Responsibility |
|---|---|
| `RunItUpWatchApp.swift` | `@main`, app scene, injects `WorkoutManager` |
| `WorkoutManager.swift` | HealthKit session/builder lifecycle, publishes `@Published` metrics + state |
| `RunMilestones.swift` | Pure milestone engine + speech phrasing (Swift port of `js/run-logic.js`) |
| `AutoPause.swift` | Pure auto-pause detector (Swift port of the same JS engine) |
| `CoachFeedback.swift` | Wrist haptics + `AVSpeechSynthesizer` (Bluetooth-route gated) |
| `PhoneSync.swift` | `WCSession` activation, `transferUserInfo` of finished runs, watch-side backlog |
| `StartView.swift` | Goal picker (1/2/3/5/custom via Digital Crown/just run) + START |
| `RunView.swift` | Live metrics, goal ring, pause/resume/stop |
| `SummaryView.swift` | Finish summary incl. avg heart rate + GOAL HIT |
| `RunItUpWatchTests/RunMilestonesTests.swift` | XCTest mirroring `tests/run-logic.test.js` cases |

### Metrics sourcing

- **Distance:** `HKQuantityTypeIdentifier.distanceWalkingRunning` from `HKLiveWorkoutBuilder`
  (GPS+motion fusion), NOT haversine over raw fixes. Route points come from
  `HKWorkoutRouteBuilder` fed by `CLLocationManager`. The full route stays in Health; the copy sent
  to the phone is thinned to at most 400 points (`transferUserInfo` payloads must stay well under
  the ~64 KB limit).
- **Heart rate:** live `heartRate` quantity; average taken from the builder's statistics at end.
- **Calories:** `activeEnergyBurned` (written to Health; not sent to Supabase).
- **Elapsed:** `HKLiveWorkoutBuilder.elapsedTime` — Apple's own clock already excludes time spent in
  `HKWorkoutSession.pause()`, so the phone's monotonic-accumulator workaround is unnecessary here.
- **Auto-pause:** watchOS does NOT auto-pause third-party workout sessions (the Settings toggle
  applies to Apple's own Workout app), so the phone's detector is ported to Swift in
  `AutoPause.swift` — same thresholds (< 0.6 m/s sustained 6 s → pause, ≥ 1.0 m/s twice → resume,
  15 s start immunity, 0.6–1.0 m/s neutral band) — driven by `CLLocation.speed`, which is a real
  value on-device. It calls `HKWorkoutSession.pause()/resume()` so Apple's clock stays the single
  source of truth. Manual pause remains sticky. Unit-tested alongside the milestone engine.

### Feedback rules

- **Haptics** (always on): `.notification` at each mile, `.directionUp` at halfway,
  `.success` at goal, `.stop` at finish. Distinct patterns, no settings needed.
- **Speech:** only when `AVAudioSession.sharedInstance().currentRoute.outputs` contains a
  Bluetooth route (`.bluetoothA2DP`/`.bluetoothLE`/`.bluetoothHFP`) — never blast the watch speaker
  mid-run. Same phrasing as the phone, `.duckOthers`.
- **Screen:** large lime-on-black metrics; miles primary inside the goal ring, then time, pace,
  heart rate.

### Phone side

- `ios/App/App/WatchBridgePlugin.swift` — Capacitor plugin + `WCSessionDelegate`. Receives
  `didReceiveUserInfo`, emits a `watchRun` event to JS; receives `didReceiveApplicationContext`,
  emits `watchWorkoutState` (`{active: Bool}`). Buffers runs that arrive before JS listeners attach.
- `js/watch-sync.js` — on `watchRun`: build the RPC payload (reusing `_runEventTypeFor` for club-run
  credit and the watch's `clientRunId` as `p_client_run_id`), then `_addPendingRun` +
  `_saveRunPayload`, falling back to the existing retry queue when offline or logged out.
  On `watchWorkoutState.active`: swap the home START RUN button to a disabled
  "TRACKING ON APPLE WATCH" state so one run can't be recorded twice.
- No changes to `js/run-tracker.js` internals beyond exposing what already exists as globals.

### Database (Supabase, Management API — repo push is drifted)

- `runs` + `avg_heart_rate int null`, `source text null` (`'watch'` | `'phone'`).
- `save_run_with_checkin` gains `p_avg_heart_rate int default null`, `p_source text default null`
  (12 args). Existing 10-arg named callers — including v1.3 in review — keep resolving because
  PostgREST binds RPC arguments by name and the new params have defaults.

## Error handling

- Health permission denied → StartView shows why and offers Settings; no run can start.
- Location permission denied → run still tracks distance (motion fusion) with no route; toast on watch.
- Workout session interrupted/ended by the OS → builder finalizes what exists, run is queued.
- Watch storage of queued runs is capped at 20 newest (backlog is bounded).
- Phone receives a run while logged out → held in the existing pending queue, saved after next login.
- Duplicate delivery of the same `clientRunId` → server returns the existing row (already built).

## Testing

- `RunMilestonesTests` mirrors the node cases (mile splits, halfway, final quarter, goal, post-goal
  splits, phrasing edge values) so the two implementations can't drift silently.
- Paired iPhone + Apple Watch simulator: simulated location drives a full goal run — verify miles,
  goal ring, milestone haptics logged, finish summary, `transferUserInfo` arrival on the phone, the
  START RUN guard, and a real row in prod with `source='watch'` and the watch's client id.
- Duplicate-delivery test: send the same payload twice, assert one row.
- iOS regression: phone-only tracking unchanged; web build untouched.
- **Device-only, cannot be simulated:** heart rate, wrist haptics, AirPods speech routing, real GPS
  accuracy, and true background behavior with the wrist down. These require Nelson's Apple Watch
  before release; release notes must not promise what hasn't been felt on a wrist.

## Ship

v1.4 (build 1) after v1.3 is approved (a watch app cannot be added to a build already in review).
App Store Connect additionally requires **Apple Watch screenshots** on the listing — generate from
the simulator. 4-agent review before delivery per standing rule.

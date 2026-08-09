# Run Tracker v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Background-safe GPS run tracking with distance goals, an on-device AI voice coach, auto-pause, and a lock-screen Live Activity — shipping as v1.3.

**Architecture:** One in-house Capacitor plugin (`RunEngine`, Swift, app target) provides background CLLocationManager GPS, AVSpeechSynthesizer speech with music ducking, and ActivityKit Live Activities. All run logic (distance, milestones, auto-pause, persistence) stays in JS; pure logic lives in `js/run-logic.js` so it's unit-testable in node. Web build behavior unchanged.

**Tech Stack:** Vanilla JS (no bundler — globals via `<script>` tags), Capacitor 8 (SPM, no CocoaPods), Swift/SwiftUI, Supabase (prod project `rouvbfejsyfcmswlsezd`), xcodeproj ruby gem 1.27.0 for target surgery.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-run-tracker-v2-design.md`. Read it first.
- Brand: ONLY #0A0A0A / #1A1A1A / #252525 / #BFFF00 / #99CC00 / #FFFFFF / #9A9A9A. No emojis anywhere in UI or speech.
- Copy style: bold uppercase headlines (Big Shoulders Display), Inter body. Widget uses SF system font (heavy, condensed) — do NOT try to embed webfonts in the extension.
- App deployment target stays **15.0**. Live Activity code gated `#available(iOS 16.2, *)`; widget extension target min **16.2**.
- No new npm dependencies. No third-party native plugins. No hype/encouragement voice lines.
- Web build (`html.web`) must keep current behavior: run tracking gated off with the existing toast.
- Working dir: `/Users/nelsontaylor/Documents/runitup-app`. Build web bundle with `npm run build`, sync native with `npx cap sync ios`.
- iOS build check (used by several tasks): `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build | tail -5` → must end `BUILD SUCCEEDED`.
- Node test runner: plain `node tests/run-logic.test.js` (no framework; `console.assert`-style helpers, exit 1 on failure).
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Supabase changes go through the Management API (`POST https://api.supabase.com/v1/projects/rouvbfejsyfcmswlsezd/database/query`, bearer token from `~/.supabase/access-token`), NOT `supabase db push`.

---

### Task 1: Pure run logic engine (`js/run-logic.js`) — TDD

**Files:**
- Create: `js/run-logic.js`
- Create: `tests/run-logic.test.js`
- Modify: `index.html:117` (add `<script src="js/run-logic.js" defer></script>` BEFORE `js/run-tracker.js`)

**Interfaces (Produces — later tasks rely on these exact names):**
```js
// All attached to window.RunLogic in browser; module.exports in node.
RunLogic.phraseDuration(ms)          // 1180000 -> "nineteen minutes, forty seconds"; 65000 -> "one minute, five seconds"; sub-minute -> "forty seconds"
RunLogic.phrasePace(secPerMile)      // 590 -> "nine fifty"; 545 -> "nine oh five"; 600 -> "ten flat"; null/Infinity -> null
RunLogic.phraseMiles(miles)          // 2 -> "two miles"; 1 -> "one mile"; 2.5 -> "2.5 miles" (digits ok for fractions); 3.1 -> "3.1 miles"
RunLogic.createMilestoneEngine(goalMiles /* number|null */)
  .onSample({ miles, elapsedMs })    // -> array of utterance strings (possibly empty), each milestone fired at most once
  .state()                           // -> { milesAnnounced, halfwayDone, finalDone, goalDone, lastMileElapsedMs } for persistence
  .restore(state)                    // re-hydrate after app kill
RunLogic.createAutoPauseDetector()
  .onFix({ speedMps, accuracyM, tMs, status }) // status: 'tracking'|'autopaused' -> 'pause' | 'resume' | null
  .reset()
RunLogic.buildFinishSummary({ miles, seconds, paceSecPerMile, goalMiles }) // -> full spoken summary string
```

**Behavior contract (write tests from this):**
- Milestones per spec: each whole mile ("Mile two. Nineteen minutes, forty seconds. Current pace nine fifty." — split time = elapsed at THIS mile minus elapsed at previous mile... **no**: per spec the spoken time is TOTAL elapsed; current pace is average pace so far. Keep it simple and truthful: "Mile two. Total time nineteen minutes, forty seconds. Average pace nine fifty."), halfway ("Halfway there. One mile to go." — remaining = goal − miles, phrased via phraseMiles), final stretch at goal − 0.25 only when goal ≥ 0.75 ("Quarter mile to go. Finish strong."), goal ("Goal hit. Two miles. Way to run it up."). No goal → mile splits only.
- Collisions merge into ONE array-returned utterance list ordered [mile, halfway, final, goal]; a 2-mi goal at 1.00 mi yields mile-1 split AND halfway in the same onSample result.
- GPS jump skipping a mile boundary announces only the latest mile (no backlog spam): jumping 0.9→2.1 announces "Mile two", not miles 1 and 2.
- Auto-pause: fires 'pause' when speedMps < 0.6 sustained ≥ 6 s (wall time from tMs) while status 'tracking'; fires 'resume' when speedMps ≥ 1.0 on 2 consecutive fixes while 'autopaused'. Fixes with accuracyM > 20 or speedMps < 0 are ignored (don't advance or reset the windows). First 15 s after detector creation: never pause.
- All functions pure/deterministic (no Date.now inside — time comes from arguments).

**Steps:**
- [ ] Write `tests/run-logic.test.js` covering: each phrase function (incl. "nine oh five", "ten flat", singular mile), a clean synthetic 2-mi goal run trace (expect countdownless sequence: mile1+halfway merged, final at 1.75, goal at 2.0, mile2 at 2.0 merged before goal), no-goal trace (splits only), GPS-jump trace, auto-pause trace (stoplight: 8 fixes at 0.2 m/s over 7 s → 'pause'; then 2 fixes at 1.2 m/s → 'resume'), noisy-accuracy trace (accuracy 40 m fixes ignored), first-15 s immunity, state()/restore() round-trip mid-run.
- [ ] Run `node tests/run-logic.test.js` → expect failure ("Cannot find module '../js/run-logic.js'").
- [ ] Implement `js/run-logic.js` with the UMD-lite footer:
```js
if (typeof module !== 'undefined' && module.exports) module.exports = RunLogic;
else window.RunLogic = RunLogic;
```
- [ ] Run tests → all pass, exit 0.
- [ ] Add the script tag to `index.html` before run-tracker.js. Run `npm run build` (sanity: file copied to www/js/).
- [ ] Commit: `feat: pure run-logic engine — milestones, auto-pause detector, speech phrasing (node-tested)`

### Task 2: RunEngine native plugin — background GPS + speech

**Files:**
- Create: `ios/App/App/RunEnginePlugin.swift`
- Create: `ios/App/App/RIUViewController.swift`
- Modify: `ios/App/App/Base.lproj/Main.storyboard:14` (customClass `RIUViewController`, customModule `App`, customModuleProvider `target`)
- Modify: `ios/App/App/Info.plist` (UIBackgroundModes: add `audio`; add `NSSupportsLiveActivities` true)
- Modify: `ios/App/App.xcodeproj/project.pbxproj` (add the two Swift files — use ruby xcodeproj one-liner below)

**Interfaces (Produces):** JS calls via `window.Capacitor.Plugins.RunEngine`:
- `startTracking()` / `stopTracking()` — resolve immediately; `location` events flow to `addListener('location', cb)` with `{lat, lng, accuracy, speedMps, timestamp}` (speedMps −1 when invalid).
- `speak({text: string, rate?: number})` — resolves AFTER the utterance finishes (drives the start countdown). Music ducks during speech, restores after.

**Swift skeleton (implement exactly this shape):**
```swift
import Foundation
import Capacitor
import CoreLocation
import AVFoundation

@objc(RunEnginePlugin)
public class RunEnginePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, AVSpeechSynthesizerDelegate {
    public let identifier = "RunEnginePlugin"
    public let jsName = "RunEngine"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateActivity",returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endActivity",   returnType: CAPPluginReturnPromise)
    ]
    private var locationManager: CLLocationManager?
    private let synthesizer = AVSpeechSynthesizer()
    private var speakCalls: [ObjectIdentifier: CAPPluginCall] = [:]

    override public func load() { synthesizer.delegate = self }

    @objc func startTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let lm = self.locationManager ?? CLLocationManager()
            lm.delegate = self
            lm.desiredAccuracy = kCLLocationAccuracyBest
            lm.activityType = .fitness
            lm.distanceFilter = kCLDistanceFilterNone
            lm.allowsBackgroundLocationUpdates = true
            lm.pausesLocationUpdatesAutomatically = false
            lm.showsBackgroundLocationIndicator = true
            if lm.authorizationStatus == .notDetermined { lm.requestWhenInUseAuthorization() }
            lm.startUpdatingLocation()
            self.locationManager = lm
            call.resolve()
        }
    }
    @objc func stopTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.locationManager?.stopUpdatingLocation()
            self.locationManager?.allowsBackgroundLocationUpdates = false
            call.resolve()
        }
    }
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
            notifyListeners("location", data: [
                "lat": loc.coordinate.latitude, "lng": loc.coordinate.longitude,
                "accuracy": loc.horizontalAccuracy, "speedMps": loc.speed,
                "timestamp": loc.timestamp.timeIntervalSince1970 * 1000.0
            ])
        }
    }

    private static func bestVoice() -> AVSpeechSynthesisVoice? {
        let en = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        let ranked = en.sorted { a, b in a.quality.rawValue > b.quality.rawValue }
        return ranked.first(where: { $0.language == "en-US" }) ?? ranked.first ?? AVSpeechSynthesisVoice(language: "en-US")
    }
    @objc func speak(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty else { call.resolve(); return }
        DispatchQueue.main.async {
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
            let u = AVSpeechUtterance(string: text)
            u.voice = Self.bestVoice()
            u.rate = Float(call.getDouble("rate") ?? Double(AVSpeechUtteranceDefaultSpeechRate))
            self.speakCalls[ObjectIdentifier(u)] = call
            self.synthesizer.speak(u)
        }
    }
    private func finishUtterance(_ utterance: AVSpeechUtterance) {
        speakCalls.removeValue(forKey: ObjectIdentifier(utterance))?.resolve()
        if !synthesizer.isSpeaking && speakCalls.isEmpty {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { finishUtterance(utterance) }
    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) { finishUtterance(utterance) }
    // startActivity/updateActivity/endActivity implemented in Task 6 — until then add stubs that call.resolve()
}
```
`RIUViewController.swift`:
```swift
import UIKit
import Capacitor

class RIUViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RunEnginePlugin())
    }
}
```

**Steps:**
- [ ] Write both Swift files (include the three Live Activity stub methods resolving immediately, so pluginMethods is final now).
- [ ] Storyboard edit — change line 14 to: `<viewController id="BYZ-38-t0r" customClass="RIUViewController" customModule="App" customModuleProvider="target" sceneMemberID="viewController"/>`
- [ ] Info.plist: `UIBackgroundModes` array gets second string `audio`; add `<key>NSSupportsLiveActivities</key><true/>`.
- [ ] Add files to the app target: `ruby -e 'require "xcodeproj"; p = Xcodeproj::Project.open("ios/App/App.xcodeproj"); t = p.targets.find { |x| x.name == "App" }; g = p.main_group["App"]; ["RunEnginePlugin.swift","RIUViewController.swift"].each { |f| ref = g.new_file("App/#{f}"); t.add_file_references([ref]) }; p.save'` — NOTE: verify the created refs resolve (open the project once with `xcodebuild -list`); if paths double-nest, use `g.new_file(f)` with the group's path already `App`.
- [ ] Build check (Global Constraints command) → BUILD SUCCEEDED.
- [ ] Smoke: `npm run build && npx cap sync ios`, boot simulator (`xcrun simctl boot "iPhone 17" 2>/dev/null; open -a Simulator`), install+launch, then from Safari Web Inspector-less path just verify via app logs that no plugin errors appear at boot (`xcrun simctl launch --console-pty booted com.runitupdallas.app | grep -i runengine` shows registration, Ctrl-C after). Alternative acceptable smoke: add a temporary `console.log(!!window.Capacitor?.Plugins?.RunEngine)` in app.js, view via `log stream`, then remove it.
- [ ] Commit: `feat: RunEngine native plugin — background fitness GPS + ducking speech synthesis`

### Task 3: Database — goal columns + RPC params (prod, backward-compatible)

**Files:** none in repo (live DB change via Management API) — but append the SQL to `supabase/schema.sql` if that file tracks schema, keeping it honest.

**Steps:**
- [ ] `TOKEN=$(cat ~/.supabase/access-token)` — if missing, STOP and ask Nelson to run `! supabase login`.
- [ ] Fetch current RPC: query `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_run_with_checkin';` via `curl -s -X POST https://api.supabase.com/v1/projects/rouvbfejsyfcmswlsezd/database/query -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"query":"..."}'`. Save output to scratchpad.
- [ ] Apply: `alter table public.runs add column if not exists goal_miles numeric, add column if not exists goal_hit boolean;`
- [ ] Recreate the function from the fetched definition with two appended parameters `p_goal_miles numeric default null, p_goal_hit boolean default null` and the INSERT INTO runs column list extended with `goal_miles, goal_hit` / values `p_goal_miles, p_goal_hit`. Keep `security definer` + the pinned `search_path` EXACTLY as fetched (the 7/11 hardening pinned it — do not lose that). Re-apply `revoke execute ... from anon` / grants exactly as they exist now (query `select grantee, privilege_type from information_schema.routine_privileges where routine_name='save_run_with_checkin';` before and after; they must match).
- [ ] Verify backward compat: call the RPC via the app's anon-key REST endpoint with the OLD parameter set (no goal params) using a dummy-but-valid auth? NO — do not write fake runs to prod. Instead verify shape only: `select proargnames from pg_proc where proname='save_run_with_checkin';` shows old params + 2 new ones with defaults (defaults mean old clients keep working).
- [ ] Commit (schema.sql note if applicable): `chore: runs.goal_miles/goal_hit + save_run_with_checkin goal params (applied to prod via Management API)`

### Task 4: run-tracker.js — RunEngine wiring, persistence/resume, auto-pause, goals state, countdown

**Files:**
- Modify: `js/run-tracker.js` (this is the core task — functions below)

**Interfaces:**
- Consumes: `RunLogic.*` (Task 1), `Capacitor.Plugins.RunEngine` (Task 2), existing globals (`showToast`, `haptic`, `confirmNative`, `chicagoDateStr`, `WEEKLY_RUNS`, `currentProfile`, `supabaseClient`).
- Produces for Tasks 5/6/7: `RUN_STATE.goalMiles` (number|null), `RUN_STATE.status` gains `'autopaused'`, `setRunGoal(miles|null)`, `beginRun()` now async-countdown-first, `riuSetting(key)` helper reading localStorage settings `'riu_voice_coach'`/`'riu_auto_pause'` (default `'on'`), and the event bus later tasks subscribe to:
```js
const RunTrackerEvents = { listeners: [], emit(name, ...a) { for (const l of this.listeners) { try { l[name]?.(...a); } catch (e) { console.warn(e); } } } };
window.RunTrackerEvents = RunTrackerEvents;
// Event names: onMilestones(utterances), onStatusChange(status, ctx?), onSample(stats)
```

**Exact changes:**
- [ ] `RUN_STATE` gains: `goalMiles: null, milestone: null /* engine */, autoPause: null /* detector */, autoPausedAt: null, lastSnapshotAt: 0, engineListener: null`.
- [ ] New `const LIVE_RUN_KEY = 'riu_live_run';` and `function _snapshotLiveRun(force)` — throttled 5 s unless `force`; writes `{v:1, userId: currentProfile?.id, startedAt, totalPausedMs, pausedAt, status, distanceMeters, points, goalMiles, milestoneState: RUN_STATE.milestone?.state(), t: Date.now()}`. Points thinned to every 2nd point above 2,000 before writing. Call it from `_onPosition` (accepted points), pause/resume/auto transitions (force), and clear it in `_resetRun`.
- [ ] New `async function checkLiveRunRecovery()` — reads snapshot; ignore if `!snap || snap.userId !== currentProfile?.id || Date.now() - snap.t > 12*3600*1000` (stale → if distance ≥ 0.05 mi build the save payload from the snapshot and reuse the existing pending-save path, else discard; either way remove key). Fresh snapshot → `confirmNative('You had a run going — pick up where you left off?', 'Resume Run', 'Discard')`; resume restores all fields, `RUN_STATE.milestone = RunLogic.createMilestoneEngine(goalMiles)` + `.restore(milestoneState)`, `RUN_STATE.autoPause = RunLogic.createAutoPauseDetector()`, `lastPoint = null`, restarts `_startWatchPosition()`, timer interval, wake lock, tracker UI, and Live Activity (Task 6 hook). Wire it where `retryPendingRunSave` is scheduled: `setTimeout(() => { retryPendingRunSave(); checkLiveRunRecovery(); }, 8000);`
- [ ] Rewrite `_startWatchPosition` native branch to use RunEngine:
```js
const engine = window.Capacitor?.Plugins?.RunEngine;
if (window.Capacitor?.isNativePlatform() && engine) {
  const perm = await window.Capacitor.Plugins.Geolocation.requestPermissions({ permissions: ['location'] });
  if (perm?.location === 'denied') throw new Error('Location permission denied');
  RUN_STATE.engineListener = await engine.addListener('location', (fix) => {
    _onEngineFix(fix);
  });
  await engine.startTracking();
  return;
}
```
  (web fallback branch unchanged; `_stopWatchPosition` native branch → `engineListener?.remove(); engine.stopTracking()`.)
- [ ] New `_onEngineFix(fix)` — the single native pipeline: (1) auto-pause: if `riuSetting('riu_auto_pause') === 'on'` and status is tracking/autopaused, `const action = RUN_STATE.autoPause.onFix({speedMps: fix.speedMps, accuracyM: fix.accuracy, tMs: fix.timestamp, status: RUN_STATE.status})`; `'pause'` → `_autoPause()`, `'resume'` → `_autoResume()`. (2) then `_onPosition({latitude: fix.lat, longitude: fix.lng, accuracy: fix.accuracy}, fix.timestamp)`.
- [ ] `_onPosition` additions (native+web shared): after distance accepted, run milestones —
```js
const stats = _computeStats();
const utterances = RUN_STATE.milestone ? RUN_STATE.milestone.onSample({ miles: stats.miles, elapsedMs: _elapsedMs() }) : [];
if (utterances.length) RunTrackerEvents.emit('onMilestones', utterances);
RunTrackerEvents.emit('onSample', stats);
_snapshotLiveRun(false);
```
- [ ] `_autoPause()` / `_autoResume()` — mirror pauseRun/resumeRun but set/clear status `'autopaused'` (autopause sets `pausedAt`; `_elapsedMs` treats `'autopaused'` exactly like `'paused'` — update its condition to `RUN_STATE.status !== 'tracking'` guard accordingly), fire `RunTrackerEvents.emit('onStatusChange', RUN_STATE.status)`, snapshot(force). Manual `pauseRun` from `'autopaused'` upgrades to sticky `'paused'` (just flips status; no autoresume from manual). `resumeRun` also resets `RUN_STATE.autoPause.reset()`.
- [ ] `beginRun()` — new flow: set `goalMiles` from prep selection (Task 5 sets `RUN_STATE.goalMiles` via `setRunGoal`), create engines (`milestone`, `autoPause`), then countdown BEFORE tracking starts: swap prep buttons for a fullscreen count overlay (`<div class="rt-countdown" id="rt-countdown">3</div>`), and `await window.VoiceCoach?.countdown?.()` (Task 6; when voice off/absent, plain 1 s-per-number visual loop; visual always runs, driven by a shared `for (let n of ['3','2','1'])` loop). Then existing start logic (status/startedAt/watch/UI). `startedAt` is set AFTER the countdown so mile 1 time is honest.
- [ ] `stopRun()` — include goals in payload only when set: `if (RUN_STATE.goalMiles) { payload.p_goal_miles = RUN_STATE.goalMiles; payload.p_goal_hit = miles >= RUN_STATE.goalMiles; }`; fire `RunTrackerEvents.emit('onStatusChange', 'finished', { miles, seconds, paceSecPerMile, goalMiles: RUN_STATE.goalMiles })` before `showRunSummaryCard` and pass `goalMiles`/`goalHit` through to the card (Task 5). Snapshot cleared via `_resetRun`.
- [ ] `_onAppForeground()` — keep, plus `_snapshotLiveRun(true)`.
- [ ] Copy: prep tips → `· Lock your phone and pocket it — tracking keeps going` / `· Auto-pause covers stoplights and water breaks` / `· Pause anytime — stop when you're done`; live-tracker hint → `Lock your phone and run — we've got you.`
- [ ] `function setRunGoal(v) { const n = parseFloat(v); RUN_STATE.goalMiles = (isFinite(n) && n > 0) ? n : null; try { localStorage.setItem('riu_last_goal', RUN_STATE.goalMiles ?? ''); } catch {} }`
- [ ] `function riuSetting(key) { const v = localStorage.getItem(key); return v === null ? 'on' : v; }`
- [ ] Manual test now (device-less): `npm run build && npx cap sync ios`, build check → BUILD SUCCEEDED; simulator: launch app as guest, START a run, feed movement: `for i in $(seq 0 40); do xcrun simctl location booted set "$(echo "32.7767 + $i*0.0002" | bc -l),-96.7970"; sleep 2; done` — distance climbs; stop feeding 8 s → AUTO-PAUSED appears; feed again → resumes; home-button the app mid-run (`xcrun simctl launch booted com.apple.Preferences`), keep feeding 20 s, return → distance kept climbing while backgrounded; `xcrun simctl terminate booted com.runitupdallas.app`, relaunch → resume prompt restores the run.
- [ ] Commit: `feat: background-safe run tracking — RunEngine wiring, crash-proof resume, auto-pause, goal state, honest countdown start`

### Task 5: Goal picker + live goal ring + GOAL HIT + countdown visuals (UI/CSS)

**Files:**
- Modify: `js/run-tracker.js` (`openRunTrackerPrep` markup, `showRunTrackerUI` markup, `showRunSummaryCard`/`shareRunSummary` goal stamp)
- Modify: `css/components.css` (or the stylesheet holding `.run-tracker-overlay` styles — grep `rt-prep-title` to find it) — add `.rt-goal-chips`, `.rt-goal-chip[.active]`, `.rt-goal-custom`, `.rt-goal-ring`, `.rt-countdown`, `.rt-autopaused-badge`

**Interfaces:** Consumes `setRunGoal`/`RUN_STATE.goalMiles` (Task 4). Chip selection persists to `localStorage 'riu_last_goal'` and pre-selects next time.

**Steps:**
- [ ] Prep screen: under the GPS status row insert
```html
<div class="rt-goal-label">GOAL</div>
<div class="rt-goal-chips" id="rt-goal-chips">
  <button class="rt-goal-chip" data-goal="">JUST RUN</button>
  <button class="rt-goal-chip" data-goal="1">1 MI</button>
  <button class="rt-goal-chip" data-goal="2">2 MI</button>
  <button class="rt-goal-chip" data-goal="3">3 MI</button>
  <button class="rt-goal-chip" data-goal="5">5 MI</button>
  <button class="rt-goal-chip" data-goal="custom">CUSTOM</button>
</div>
```
  Click handler sets active class + `setRunGoal(v)`; CUSTOM swaps in `<input type="number" inputmode="decimal" min="0.25" max="100" step="0.25" class="rt-goal-custom">` with live validation (NaN/≤0 → treated as no goal). Default selection = `riu_last_goal` (else JUST RUN).
- [ ] Live tracker: goal set → wrap the primary miles metric in an SVG progress ring (140 px, stroke #BFFF00 on #252525 track, `stroke-dasharray` driven by `min(1, miles/goal)`) updated inside `_updateTrackerUI`; below it `<div class="rt-goal-sub">OF ${goal} MI GOAL</div>`. No goal → current layout untouched. Status `'autopaused'` → show `.rt-autopaused-badge` "AUTO-PAUSED" pill (lime border, pulsing) and pause-button label RESUME; hide on resume.
- [ ] Summary card + share canvas: when `goalHit` add a lime `GOAL HIT — ${goal} MILES` stamp line under "RUN LOGGED" (both DOM card and canvas render; canvas: `ctx.fillStyle = '#BFFF00'; ctx.font = 800 44px display; ctx.fillText('GOAL HIT — 2 MILES', 540, 560)` adjusting the miles-hero y down 40 px when present).
- [ ] `.rt-countdown`: fullscreen flex-center, Big Shoulders 30 vw lime numeral, 1 s scale-in per number (animation `rtCount 1s ease` re-triggered per digit), then removed.
- [ ] Verify in simulator: chips render, custom input works, ring fills on simulated movement, GOAL HIT stamps at goal, brand palette only. Screenshot each state (`xcrun simctl io booted screenshot`).
- [ ] `npm run build && npx cap sync ios` + build check.
- [ ] Commit: `feat: distance goals — prep chips, live progress ring, GOAL HIT card stamp, countdown visuals`

### Task 6: Voice coach (`js/voice-coach.js`) + settings toggles

**Files:**
- Create: `js/voice-coach.js`
- Modify: `index.html` (script tag after run-logic.js, before run-tracker.js)
- Modify: `js/profile.js:77-91` (settings toggles section)
- Modify: `js/run-tracker.js` (hook assignments only — see below)

**Interfaces:**
- Consumes: `RunEngine.speak`, `RunLogic.buildFinishSummary`, `riuSetting` (Task 4), `window.RunTrackerEvents` hooks.
- Produces: `window.VoiceCoach = { say(text), countdown(): Promise, onMilestones, onStatusChange }`.

**Steps:**
- [ ] Implement `js/voice-coach.js`:
```js
const VoiceCoach = (() => {
  const engine = () => window.Capacitor?.Plugins?.RunEngine;
  const enabled = () => window.Capacitor?.isNativePlatform() && riuSetting('riu_voice_coach') === 'on' && !!engine();
  async function say(text) { if (!enabled() || !text) return; try { await engine().speak({ text }); } catch (e) { console.warn('[voice]', e); } }
  async function countdown() {
    // Visual loop lives in run-tracker; voice mirrors it. One utterance per beat keeps sync.
    if (!enabled()) { await new Promise(r => setTimeout(r, 3000)); return; }
    for (const n of ['Three.', 'Two.', 'One.']) { await say(n); }
    say("Let's go."); // don't await — start tracking on the beat
  }
  const statusLines = { paused: 'Paused.', autopaused: 'Auto-paused.', tracking: 'Back on.' };
  return {
    say, countdown,
    onMilestones: (utts) => { say(utts.join(' ')); },
    onStatusChange: (status, ctx) => {
      if (status === 'finished' && ctx) { say(RunLogic.buildFinishSummary(ctx)); return; }
      if (statusLines[status]) say(statusLines[status]);
    }
  };
})();
window.VoiceCoach = VoiceCoach;
```
  (Adjust Task 4's countdown/visual loop so visual digits advance per `say` resolution when voice is on — pass a per-digit callback; statusChange for `finished` passes `{miles, seconds, paceSecPerMile, goalMiles}`.)
- [ ] Register with the Task 4 event bus (end of voice-coach.js): `window.RunTrackerEvents.listeners.push({ onMilestones: (u) => VoiceCoach.onMilestones(u), onStatusChange: (s, ctx) => VoiceCoach.onStatusChange(s, ctx) });`
- [ ] Settings UI in profile.js before `.profile-actions`:
```html
<div class="profile-settings">
  <h3 class="profile-settings-title">RUN SETTINGS</h3>
  <label class="settings-toggle"><span>Voice Coach</span><input type="checkbox" ${riuSetting('riu_voice_coach')==='on'?'checked':''} onchange="localStorage.setItem('riu_voice_coach', this.checked?'on':'off')"></label>
  <label class="settings-toggle"><span>Auto-Pause</span><input type="checkbox" ${riuSetting('riu_auto_pause')==='on'?'checked':''} onchange="localStorage.setItem('riu_auto_pause', this.checked?'on':'off')"></label>
</div>
```
  Styled lime checkbox/switch in the same stylesheet as Task 5 additions; hide the whole section on web (`html.web .profile-settings { display: none; }`).
- [ ] Simulator test: full run with voice audible on the Mac (countdown → mile split via location feed at high speed with a 0.25-mi goal for a fast loop → final stretch skipped (goal < 0.75 sanity) → goal hit → finish summary). Toggle Voice Coach off → silent run. Music ducking: play Music app in sim? (No Music on sim — duck verification moves to Nelson's device test.)
- [ ] `npm run build && npx cap sync ios` + build check → BUILD SUCCEEDED.
- [ ] Commit: `feat: AI voice coach — countdown, splits, goal calls, finish summary, settings toggles`

### Task 7: Live Activity — widget extension + plugin lifecycle + wiring

**Files:**
- Create: `ios/App/RunItUpWidgets/RunItUpWidgetsBundle.swift`
- Create: `ios/App/RunItUpWidgets/RunActivityWidget.swift`
- Create: `ios/App/RunItUpWidgets/Info.plist`
- Create: `ios/App/App/RunActivityAttributes.swift` (member of BOTH targets)
- Create: `scripts/add-widget-target.rb`
- Modify: `ios/App/App/RunEnginePlugin.swift` (replace the three Activity stubs)
- Modify: `js/run-tracker.js` (Live Activity listener registration)

**Interfaces:**
- `RunActivityAttributes: ActivityAttributes` — `ContentState { miles: Double; paceText: String; statusText: String; goalMiles: Double?; adjustedStartMs: Double; frozenElapsed: String? }` (running: `frozenElapsed == nil`, clock ticks from `adjustedStartMs`; paused/autopaused: frozen string shown).
- JS: `startActivity({goalMiles})`, `updateActivity({miles, paceText, statusText, goalMiles, adjustedStartMs, frozenElapsed})`, `endActivity({finalText})` — all no-ops below iOS 16.2 and on failure.

**Steps:**
- [ ] `RunActivityAttributes.swift` (gate the whole file `#if canImport(ActivityKit)` + `@available(iOS 16.2, *)`).
- [ ] `scripts/add-widget-target.rb` — with `cp ios/App/App.xcodeproj/project.pbxproj /tmp/pbxproj.bak` FIRST:
```ruby
require 'xcodeproj'
proj = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = proj.targets.find { |t| t.name == 'App' }
w = proj.new_target(:app_extension, 'RunItUpWidgets', :ios, '16.2')
grp = proj.main_group.new_group('RunItUpWidgets', 'RunItUpWidgets')
srcs = ['RunItUpWidgetsBundle.swift', 'RunActivityWidget.swift'].map { |f| grp.new_file(f) }
w.add_file_references(srcs)
attr_ref = proj.main_group['App'].files.find { |f| f.path.end_with?('RunActivityAttributes.swift') }
w.add_file_references([attr_ref])   # shared with app target
w.build_configurations.each do |c|
  c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.runitupdallas.app.RunItUpWidgets'
  c.build_settings['INFOPLIST_FILE'] = 'RunItUpWidgets/Info.plist'
  c.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  c.build_settings['SWIFT_VERSION'] = '5.0'
  c.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  c.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  c.build_settings['DEVELOPMENT_TEAM'] = 'KR5KYG8W44'
  c.build_settings['MARKETING_VERSION'] = '1.3'
  c.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  c.build_settings['SKIP_INSTALL'] = 'YES'
  c.build_settings['INFOPLIST_KEY_CFBundleDisplayName'] = 'Run It UP!'
end
app.add_dependency(w)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
        app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.dst_subfolder_spec = '13'
bf = embed.add_file_reference(w.product_reference)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
proj.save
```
  Extension Info.plist: `NSExtension → NSExtensionPointIdentifier = com.apple.widgetkit-extension` only.
- [ ] Widget UI (`RunActivityWidget.swift`): `ActivityConfiguration(for: RunActivityAttributes.self)`. Lock screen: black card (`.activityBackgroundTint(Color(red:0.04,green:0.04,blue:0.04))`), lime "RUN IT UP!" caption, big miles `.font(.system(size: 44, weight: .black, design: .default)).monospacedDigit()` in #BFFF00, elapsed = `state.frozenElapsed ?? Text(timerInterval:)` pattern (running: `Text(timerInterval: Date(timeIntervalSince1970: state.adjustedStartMs/1000)...Date.distantFuture, countsDown: false)`), pace text, goal → `ProgressView(value: min(1, miles/goal))` tinted lime, statusText ("LIVE" / "PAUSED" / "AUTO-PAUSED"). Dynamic Island: compact leading lime running-figure `Image(systemName: "figure.run")`, trailing miles; expanded mirrors lock screen; minimal = figure.run.
- [ ] Replace plugin stubs with a `LiveActivityBridge` (same file or `ios/App/App/LiveActivityBridge.swift` in app target): holds `Activity<RunActivityAttributes>?`; start = `Activity.request(attributes: .init(), content: .init(state: s, staleDate: nil))`; update = `Task { await activity?.update(.init(state: s, staleDate: nil)) }`; end = `Task { await activity?.end(..., dismissalPolicy: .after(.now + 4)) }` with final frozen state. Everything inside `if #available(iOS 16.2, *)` + `guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(); return }`.
- [ ] run-tracker.js: register a listener `{ onSample, onStatusChange }` that (a) on beginRun/resume-recovery calls `startActivity`, (b) throttles `updateActivity` to every 3 s or 0.01 mi change (running: `adjustedStartMs = Date.now() - _elapsedMs()`, `frozenElapsed: null`; paused/autopaused: `frozenElapsed: _formatDuration(_elapsedMs())`), (c) on `'finished'` calls `endActivity`. All wrapped so absence/failure is silent.
- [ ] Run the ruby script, then build check → BUILD SUCCEEDED (on failure: restore `/tmp/pbxproj.bak`, fix, retry).
- [ ] Simulator verify: start a run, ⌘L lock → Live Activity on lock screen with ticking clock; feed movement → miles/ring advance; pause → PAUSED frozen time; stop → activity ends.
- [ ] Commit: `feat: lock-screen Live Activity + Dynamic Island via RunItUpWidgets extension`

### Task 8: Version 1.3 (build 1) + archive pipeline validation

**Files:**
- Modify: `ios/App/App.xcodeproj/project.pbxproj` (App target: `MARKETING_VERSION = 1.3;`, `CURRENT_PROJECT_VERSION = 1;` — widget already 1.3/1)

**Steps:**
- [ ] Bump versions (both Debug + Release configs), build check.
- [ ] Full archive WITHOUT upload: `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath build/RunItUp-1.3.xcarchive archive -allowProvisioningUpdates -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_FJRAQ7KJRN.p8 -authenticationKeyID FJRAQ7KJRN -authenticationKeyIssuerID f47f5bdd-6d57-49a9-b958-fe47d21eae03 | tail -5` → ARCHIVE SUCCEEDED. Confirm `build/RunItUp-1.3.xcarchive/Products/Applications/App.app/PlugIns/RunItUpWidgets.appex` exists.
- [ ] Commit: `chore: bump to 1.3 (build 1)`

### Task 9: End-to-end verification + web regression

**Steps:**
- [ ] Node tests still green: `node tests/run-logic.test.js`.
- [ ] Full simulator scenario in one sitting (record with `xcrun simctl io booted recordVideo`): guest login → START RUN → 2 MI goal chip → countdown speaks+shows → simulated 2-mi drive (location feed loop) hearing mile split → halfway → final stretch → goal hit; lock screen shows Live Activity throughout; app backgrounded 30 s mid-run keeps counting; terminate+relaunch resumes; STOP → summary card with GOAL HIT; run row saved (check via app Stats tab).
- [ ] Web regression: `npm run build`, serve `www/` (`python3 -m http.server 8788 -d www`), Playwright/Chrome check — desktop layout intact, START RUN on web still shows the "iPhone app" toast, profile has NO Run Settings section, zero console errors.
- [ ] Fix anything found; re-run. Commit fixes individually.
- [ ] Commit (if changes): `test: e2e verification fixes`

### Task 10: Multi-agent review pass + ship prep

**Steps:**
- [ ] Run the standing 4-agent review (iOS/Swift reviewer, JS correctness reviewer, UX/brand reviewer, adversarial QA) via Workflow over the full diff `git diff 89a1265..HEAD`; fix confirmed findings; re-verify with Task 9's checks.
- [ ] Push `main`. Export+upload the archive to App Store Connect (same auth flags + `-exportArchive` with `build/ExportOptions.plist`) so Nelson can TestFlight the real-world 2-miler — his acceptance run gates the actual App Store submission (what's-new text + Submit stay manual, per his flow).
- [ ] Update memory: `runitup-project.md` (v1.3 state), new gotchas discovered.

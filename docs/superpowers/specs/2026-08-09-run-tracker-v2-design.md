# Run Tracker v2 — Design Spec

**Date:** 2026-08-09 · **Ships as:** v1.3 (build 1) · **Approved by Nelson:** yes (conversation, 8/9)

## Problem

The GPS run tracker runs entirely in the WebView (`js/run-tracker.js` + `@capacitor/geolocation`).
iOS suspends the WebView when the screen locks, so tracking freezes mid-run; if iOS then kills the
app, all run state is lost and the run "starts over." There are no goals, no audio feedback, and no
lock-screen presence.

## Goals (user-approved scope)

1. Runs keep tracking with the screen locked / app backgrounded, and survive an app kill.
2. Distance goals: quick picks 1 / 2 / 3 / 5 mi + custom, or no goal.
3. Voice coach through headphones using Apple's on-device neural voice, ducking music:
   countdown start, every-mile splits, halfway, final-stretch (¼ mi to goal), goal reached,
   run-finished summary, pause/resume confirmations. **No hype/encouragement lines** (not selected).
4. Auto-pause when GPS shows the runner stopped; auto-resume on movement.
5. Live Activity: lock screen + Dynamic Island with live miles / time / pace / goal progress
   (iOS 16.2+, availability-gated; no banner-notification fallback — not selected).

Non-goals: time-based goals, cloud TTS voices, Android parity (iOS-first; Android keeps current
foreground behavior), push notifications, route maps.

## Architecture

One in-house native Capacitor plugin — **RunEngine** (Swift, lives in the app target; no new pods) —
replaces three would-be third-party dependencies. Business logic (distance math, milestones,
auto-pause, persistence) stays in JS so the web build is untouched.

```
js/run-tracker.js  ──┐                        ┌─ CLLocationManager (background fitness GPS)
js/voice-coach.js  ──┼── RunEngine plugin ────┼─ AVSpeechSynthesizer + AVAudioSession (duck music)
(milestone engine) ──┘   (Swift, app target)  └─ ActivityKit (Live Activity, iOS 16.2+ gated)
                                              + RunItUpWidgets extension target (SwiftUI views)
```

### RunEngine plugin API (JS ⇄ Swift)

- `startTracking()` / `stopTracking()` — CLLocationManager: `desiredAccuracy=best`,
  `activityType=.fitness`, `distanceFilter=none`, `allowsBackgroundLocationUpdates=true`,
  `pausesLocationUpdatesAutomatically=false`, `showsBackgroundLocationIndicator=true`.
  Emits `location` events `{lat, lng, accuracy, speed, timestamp}` to JS listeners.
  Works with existing When-In-Use permission (tracking always starts foreground).
- `speak({text})` — AVSpeechSynthesizer; best installed en-US voice (premium > enhanced > default).
  AVAudioSession `.playback` + `[.duckOthers, .mixWithOthers]`, activated per utterance queue,
  deactivated with `notifyOthersOnDeactivation` so music volume restores.
- `startActivity/updateActivity/endActivity` — Live Activity lifecycle; `#available(iOS 16.2)` guarded.
  ContentState: `{miles, pace, status, goalMiles, adjustedStart}` — elapsed time ticks natively via
  `Text(timerInterval:)` from `adjustedStart` (= now − elapsed, resent on each update), so the
  lock-screen clock runs smoothly between updates; paused states show a frozen elapsed string.
- Registration: custom `CAPBridgeViewController` subclass overriding `capacitorDidLoad` →
  `bridge?.registerPluginInstance(RunEnginePlugin())` (documented app-local plugin path, verify
  against current Capacitor 8 docs at build time).

### iOS project changes

- `Info.plist`: add `audio` to `UIBackgroundModes` (voice while locked); add
  `NSSupportsLiveActivities=true`. (`location` mode + Always/WhenInUse strings already present.)
- New target **RunItUpWidgets** (widget extension, min iOS 16.2): ActivityConfiguration lock-screen
  view + DynamicIsland (compact: lime runner glyph + miles; expanded: miles/time/pace + goal bar).
  Brand: #0A0A0A / #BFFF00; Big Shoulders if the font file embeds cleanly, else SF heavy/condensed.
  `RunActivityAttributes.swift` shared between app + extension targets.
  pbxproj edited via scripted tooling with a backup; archive/upload pipeline must still work.
- App deployment target stays 15.0.

### js/run-tracker.js changes

- Native path swaps `Geolocation.watchPosition` → RunEngine `location` events (web fallback unchanged;
  GPS warmer stays foreground-only via `@capacitor/geolocation` — RunEngine is for live runs only).
- **Persistence:** snapshot `{userId, startedAt, totalPausedMs, status, distanceMeters, points,
  goalMiles, announced}` to localStorage on accepted points (throttled ≥5 s). On launch, snapshot
  < 12 h old → "Pick up where you left off?" → resume (restore state, restart tracking + Live
  Activity, re-anchor) or save/discard. Route points thinned above ~2,000 stored points.
- **Auto-pause:** speed from native fix (fallback: derived from consecutive points, accuracy < 20 m
  only). Stopped = speed < 0.6 m/s sustained 6 s → status `autopaused` (distance+time frozen, GPS
  stays on, voice "Auto-paused", Live Activity PAUSED). Moving = ≥ 1.0 m/s for 2 consecutive fixes →
  auto-resume ("Back on"). Never fires in the first 15 s. Manual pause is sticky (no auto-resume).
  Settings toggle, default ON.
- **Goals:** prep-screen chips (1/2/3/5/custom/no-goal), goal progress ring on live tracker,
  GOAL HIT stamp on summary card. Countdown "Three. Two. One. Let's go." plays on START;
  tracking begins when it ends.
- Remove all "keep the screen on" copy → "Lock your phone and run — tracking keeps going."

### js/voice-coach.js (new)

Milestone engine consuming tracker events; each milestone announced exactly once (`announced` set,
persisted). Utterances: mile splits ("Mile two. Nineteen minutes, forty seconds. Current pace nine
fifty."), halfway, final stretch (goal − 0.25 mi, only when goal ≥ 0.75 mi), goal hit, finish
summary, pause/resume/auto-pause confirmations. Colliding milestones (e.g. mile 1 = halfway of 2 mi)
merge into one utterance. Numbers phrased for speech, never read as decimals. Settings toggle
("Voice Coach"), default ON. No-op on web.

### Database (Supabase, via Management API — repo push is drifted)

- `runs` + `goal_miles numeric null`, `goal_hit boolean null`.
- `save_run_with_checkin` RPC: add `p_goal_miles numeric default null`,
  `p_goal_hit boolean default null` (defaults keep old clients working).

## Error handling

- GPS permission revoked mid-run → toast + voice "GPS lost", run keeps elapsed time, saves what it has.
- Speech failure is always non-fatal (try/catch around every `speak`).
- Live Activity start failure (disabled in Settings, < 16.2) → silent no-op; tracking unaffected.
- Save failure keeps existing pending-run localStorage retry path (unchanged).
- App killed mid-run → resume prompt on next launch (persistence above).

## Testing

- Milestone/auto-pause/phrasing logic extracted pure → node-run unit checks (synthetic GPS traces:
  normal 2-miler, stoplight stop, GPS dropout, noisy fixes).
- Simulator: build + install, `simctl` location scenarios; background the app during a simulated run
  and verify distance keeps accruing; lock (⌘L) to verify Live Activity; kill + relaunch to verify
  resume prompt. TTS audible on simulator.
- Web regression: run tracking still gated off on web, everything else unchanged (Playwright pass).
- Full archive build to prove the new widget target doesn't break the upload pipeline.
- Final acceptance: Nelson runs a real 2-miler with headphones + locked phone.

## Ship

v1.3 (build 1) → App Store Connect (supersedes the never-submitted v1.2 build 1). Apple review
required; release manual per Nelson's usual flow. 4-agent review before delivery per standing rule.

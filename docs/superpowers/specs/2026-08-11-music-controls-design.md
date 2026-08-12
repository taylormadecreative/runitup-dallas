# In-Run Music Controls — Design Spec

**Date:** 2026-08-11 · **Ships as:** v1.5 · **Approved by Nelson:** yes (conversation, 8/11)

## Problem

Runners control their music by pulling the phone out mid-run and leaving the app (Control Center
or the music app itself). Nelson wants skip / pause / rewind and album switching inside Run It UP,
for Spotify and Apple Music, shipped to every user.

## The Spotify constraint (verified 2026-08-11)

iOS has no public API to control another app's audio — the only route to Spotify is Spotify's own
App Remote SDK, which authenticates against a Spotify developer Client ID. Spotify's current
policy (Feb 2026 update) caps unapproved apps at **5 authorized Spotify accounts total**, requires
the app owner to hold Premium, and grants public (extended-quota) access only to registered
businesses with an existing 250k+ MAU service. A run club app cannot clear that bar, so real
Spotify control cannot ship to the general user base. **User decision:** full Apple Music
integration + a graceful Spotify fallback; no Spotify SDK.

## Goals (user-approved scope)

1. A compact **music bar** on the live run overlay (between the time/pace row and PAUSE/STOP)
   and on the READY TO RUN prep screen, so music can be queued before the run starts.
2. Transport controls for Apple Music: play/pause, skip, and back (back restarts the current
   track, or jumps to the previous track when under ~3 s in — standard music-app behavior).
3. Now-playing display: small album art, track title, artist — live-updating as tracks change.
4. **Picker sheet** (bottom sheet over the run screen): two tabs, **Playlists | Albums**, from
   the user's Apple Music library, with a text filter for large libraries. Tap → plays → closes.
5. **Spotify/other-app fallback:** when audio is playing but not from the Music app, the bar
   shows "Playing in another app" with a single **Open Spotify** tap-target if Spotify is
   installed; otherwise no action is offered. No dead buttons.
6. **Nothing-playing state:** bar reads "♪ Start your music" and opens the picker.
7. Web/Android: bar does not render (feature-detected, same pattern as `hasRunEngine()`).

Non-goals (deliberate v1 cuts): Spotify SDK integration (policy-blocked), Watch music controls
(watchOS's built-in Now Playing app already controls phone audio, Spotify included), Live
Activity music buttons, shuffle/repeat toggles, Apple Music catalog search beyond the user's
library, volume control.

## Architecture

One in-house app-local Capacitor plugin — **MusicRemote** (`ios/App/App/MusicRemotePlugin.swift`,
registered in `RIUViewController.capacitorDidLoad` beside RunEngine and WatchBridge; no pods, no
third-party deps). It wraps `MPMusicPlayerController.systemMusicPlayer`, which drives the
built-in Music app.

### Plugin API

| Method | Behavior |
|---|---|
| `getState()` | `{ playbackState, nowPlaying: {title, artist, artworkBase64} \| null, otherAudioPlaying, spotifyInstalled, authStatus }` |
| `play()` / `pause()` | Transport on the Music app's current queue |
| `next()` / `previous()` | Uses `skipToNextItem` / `skipToBeginning` / `skipToPreviousItem`. iOS 16–18 gotcha: assigning `nowPlayingItem` to jump tracks silently fails — never use it |
| `getLibrary({kind})` | `kind: 'albums' \| 'playlists'` → `[{id, title, subtitle}]` (no artwork — see below) |
| `getCollectionArtwork({kind, id})` | Small JPEG base64 thumb for one row; called lazily as the picker scrolls so large libraries don't stall the bridge |
| `playCollection({kind, id})` | `setQueue` with that collection, then `play()` |
| `requestAuthorization()` | `MPMediaLibrary.requestAuthorization` |
| `openSpotify()` | Opens `spotify:` URL |
| `openSettings()` | Opens the app's iOS Settings page (denied-permission recovery) |

**Event:** `musicStateChanged` → pushed via `notifyListeners` from the system playback
notifications (`playbackStateDidChange`, `nowPlayingItemDidChange`, with
`beginGeneratingPlaybackNotifications`). The bar never polls.

### JS side

New module `js/music-bar.js` (pattern: `voice-coach.js`):

- Renders the bar into the run overlay and prep screen; renders the picker sheet.
- **Bar state machine is a pure function** (playing / other-app / empty / no-permission →
  visual state), unit-tested like `run-logic.js`.
- Subscribes to `musicStateChanged`; re-queries state on app foreground.
- **Strictly additive:** `run-tracker.js` never depends on it. Every plugin call is wrapped;
  any failure degrades or hides the bar. No code path from music into tracking, voice coach,
  or run saves.

### Config

- `Info.plist` + `NSAppleMusicUsageDescription`: "Run It UP shows what's playing and lets you
  switch albums or playlists mid-run."
- `Info.plist` + `LSApplicationQueriesSchemes`: `spotify` (needed only for `canOpenURL`
  detection powering the fallback button).
- No background-mode changes, no DB/Supabase changes, no Watch-target changes.

## Permissions

Transport commands (play/pause/skip) go straight to the Music app and — per Apple's docs wording
and community consensus — do **not** require media-library permission. Apple never guarantees
this in writing, so the first on-device task is confirming it (see Testing). Reading now-playing
metadata and listing albums/playlists **do** require `MPMediaLibrary` authorization.

Flow: the bar first renders in a generic "♪ Music" mode with working transport buttons and no
prompt. The first tap on the track-info area or the picker triggers `requestAuthorization()`.
Granted → full bar with metadata. Denied → generic mode persists; the picker tap shows
"Music access is off" linking to the app's iOS Settings page (`openSettingsURLString`).

## Data flow

1. Run overlay (or prep screen) renders → `music-bar.js` feature-detects MusicRemote →
   `getState()` → pure state function → bar HTML.
2. User taps a transport button → plugin method → Music app acts → system notification →
   `musicStateChanged` event → bar re-renders. (UI reflects the *actual* player state, never an
   optimistic guess.)
3. User taps track info / "Start your music" → auth check → picker sheet → `getLibrary` →
   rows render, artwork lazy-loads per row → tap → `playCollection` → sheet closes → event
   updates bar.
4. Spotify playing → `getState()` shows `otherAudioPlaying && playbackState != playing` →
   fallback state → "Open Spotify" → `openSpotify()`.

## Error handling

Rule: **the music bar degrades, the run never does.**

- Permission denied → generic bar + Settings deep link from the picker.
- Empty library → friendly picker empty state ("Nothing in your library yet").
- Music app has no queue → play button would be dead, so that state routes to the picker
  ("Start your music") instead.
- Any native failure → bar quietly falls back or hides. No error toasts mid-run.
- Voice coach interplay: none needed — it already ducks all system audio (`duckOthers`) and is
  untouched.

## Testing

**The iOS Simulator has no Music app** — the native path only proves out on a real iPhone.

1. Unit tests (node): the bar state machine — every input combination → expected visual state.
2. Mock mode for the plugin (JS-level) so simulator/Playwright can exercise all four bar states
   and the picker end-to-end without a device.
3. On-device checklist (Nelson's iPhone), in order:
   - **First:** clean install → tap play/pause/skip with NO permission granted → confirm no
     prompt appears, controls work, and `playbackState` reads correctly (the generic bar needs
     it to pick the right play/pause icon). Validates the permission assumptions the UX rests on.
   - Controls + live metadata mid-run, including across screen lock/unlock.
   - Picker: albums tab, playlists tab, filter, artwork lazy-load, switch mid-run.
   - Spotify fallback: play Spotify → bar shows fallback → Open Spotify jumps correctly.
   - Deny permission → generic bar + Settings link path.
4. Existing run-tracker E2E must pass unchanged (bar is additive).

## Ship plan

v1.5, next release after the v1.4 Watch update clears review. App Review notes: one line
explaining the music-library usage string. Future ideas parked, not promised: Watch tip surfacing
the built-in Now Playing app, Live Activity music buttons, shuffle toggle, Spotify SDK if Run It
UP ever reaches a Spotify partnership.

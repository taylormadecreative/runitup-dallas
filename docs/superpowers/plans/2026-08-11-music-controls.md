# In-Run Music Controls (v1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A music bar on the run screens — Apple Music transport controls, live now-playing info, an album/playlist picker, and a graceful Spotify fallback — per `docs/superpowers/specs/2026-08-11-music-controls-design.md`.

**Architecture:** One app-local Capacitor plugin `MusicRemote` (Swift, wraps `MPMusicPlayerController.systemMusicPlayer`, same pattern as RunEngine) + a pure JS state machine (`js/music-bar-logic.js`, node-tested) + a UI module (`js/music-bar.js`) that run-tracker touches only via `window.MusicBar?.mount?.(overlay)`.

**Tech Stack:** Vanilla JS, Capacitor 8, Swift (MediaPlayer framework), plain-node unit tests (`node tests/<file>.test.js`).

## Global Constraints

- iOS-native only: the bar renders only when `window.Capacitor?.isNativePlatform()` and the `MusicRemote` plugin exist (or `window.__MUSIC_MOCK__` is set for testing). Web/Android: never renders.
- **The music bar degrades, the run never does.** Every plugin call is try/caught; failures hide or degrade the bar. No error toasts mid-run.
- **Never read library data (nowPlayingItem, MPMediaQuery) unless `MPMediaLibrary.authorizationStatus() == .authorized`** — reading it is what triggers the iOS permission prompt. Transport commands and `playbackState` are permission-free.
- iOS 16–18 gotcha: assigning `nowPlayingItem` to jump tracks silently fails — only `skipToNextItem` / `skipToPreviousItem` / `skipToBeginning` may be used.
- `run-tracker.js` gets exactly two one-line additions (`window.MusicBar?.mount?.(overlay)`), nothing else.
- Usage string, verbatim: `Run It UP shows what's playing and lets you switch albums or playlists mid-run.`
- Icons are inline SVG (`fill="currentColor"`), never Unicode glyphs (project rule since the v1.1 flame-icon fix).
- All library-sourced text rendered via `textContent` or `escapeHtml()` (global from `js/supabase.js`).
- No DB/Supabase changes, no Watch-target changes, no new pods/npm deps, no background-mode changes.
- Version bump / App Store submission is release-time work, NOT part of this plan.

---

### Task 1: Bar state machine (`music-bar-logic.js`)

**Files:**
- Create: `js/music-bar-logic.js`
- Test: `tests/music-bar-logic.test.js`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `MusicBarLogic.barState(snapshot)` — `snapshot` is the plugin's state dict `{ native: bool, authStatus: 'authorized'|'denied'|'restricted'|'notDetermined', playbackState: 'playing'|'paused'|'interrupted'|'stopped', otherAudioPlaying: bool, spotifyInstalled: bool, nowPlaying: {title, artist, artworkBase64?}|null }` (or `null`). Returns one of:
  - `{ mode: 'hidden' }`
  - `{ mode: 'transport', playing: bool, lite: bool, title: string, subtitle: string, artworkBase64: string|null }`
  - `{ mode: 'other-app', showOpenSpotify: bool }`
  - `{ mode: 'start-music' }`
  Exported as `window.MusicBarLogic` (browser) and `module.exports` (node).

- [ ] **Step 1: Write the failing test**

Create `tests/music-bar-logic.test.js`:

```js
// Unit tests for js/music-bar-logic.js — run with: node tests/music-bar-logic.test.js
const MusicBarLogic = require('../js/music-bar-logic.js');

let failures = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}\n  expected: ${e}\n  actual:   ${a}`); }
  else console.log(`ok ${label}`);
}

const base = {
  native: true, authStatus: 'authorized', playbackState: 'stopped',
  otherAudioPlaying: false, spotifyInstalled: false, nowPlaying: null
};
const track = { title: 'HUMBLE.', artist: 'Kendrick Lamar', artworkBase64: 'abc123' };

// ---------- hidden ----------
eq(MusicBarLogic.barState(null), { mode: 'hidden' }, 'null snapshot -> hidden');
eq(MusicBarLogic.barState({ ...base, native: false }), { mode: 'hidden' }, 'not native -> hidden');

// ---------- transport: Music app is the player ----------
eq(MusicBarLogic.barState({ ...base, playbackState: 'playing', nowPlaying: track }),
   { mode: 'transport', playing: true, lite: false, title: 'HUMBLE.', subtitle: 'Kendrick Lamar', artworkBase64: 'abc123' },
   'authorized playing -> full transport');
eq(MusicBarLogic.barState({ ...base, playbackState: 'paused', nowPlaying: track }),
   { mode: 'transport', playing: false, lite: false, title: 'HUMBLE.', subtitle: 'Kendrick Lamar', artworkBase64: 'abc123' },
   'authorized paused with queue -> paused transport');
eq(MusicBarLogic.barState({ ...base, playbackState: 'interrupted', nowPlaying: track }).playing,
   false, 'interrupted counts as paused');

// Music playing wins even if otherAudioPlaying is true (the Music app IS
// "other audio" from our audio session's point of view).
eq(MusicBarLogic.barState({ ...base, playbackState: 'playing', otherAudioPlaying: true, nowPlaying: track }).mode,
   'transport', 'Music playing beats otherAudioPlaying');

// ---------- transport lite: no library permission ----------
eq(MusicBarLogic.barState({ ...base, authStatus: 'notDetermined', playbackState: 'playing' }),
   { mode: 'transport', playing: true, lite: true, title: 'Music', subtitle: '', artworkBase64: null },
   'unauthorized playing -> lite transport');
eq(MusicBarLogic.barState({ ...base, authStatus: 'denied', playbackState: 'paused' }),
   { mode: 'transport', playing: false, lite: true, title: 'Music', subtitle: '', artworkBase64: null },
   'denied paused -> lite transport (paused implies a queue exists)');
// Defensive: nowPlaying present but unauthorized -> still lite (never trust it)
eq(MusicBarLogic.barState({ ...base, authStatus: 'denied', playbackState: 'playing', nowPlaying: track }).lite,
   true, 'unauthorized ignores nowPlaying');

// ---------- other-app (Spotify etc.) ----------
eq(MusicBarLogic.barState({ ...base, otherAudioPlaying: true, spotifyInstalled: true }),
   { mode: 'other-app', showOpenSpotify: true }, 'other audio + spotify installed');
eq(MusicBarLogic.barState({ ...base, otherAudioPlaying: true, spotifyInstalled: false }),
   { mode: 'other-app', showOpenSpotify: false }, 'other audio, no spotify');
eq(MusicBarLogic.barState({ ...base, otherAudioPlaying: true, playbackState: 'paused', nowPlaying: track }).mode,
   'other-app', 'other audio beats a merely-paused Music queue');

// ---------- start-music ----------
eq(MusicBarLogic.barState(base), { mode: 'start-music' }, 'authorized stopped empty -> start-music');
eq(MusicBarLogic.barState({ ...base, playbackState: 'paused', nowPlaying: null }),
   { mode: 'start-music' }, 'authorized paused but NO item -> start-music (no real queue)');
eq(MusicBarLogic.barState({ ...base, authStatus: 'notDetermined' }),
   { mode: 'start-music' }, 'unauthorized stopped -> start-music');

// ---------- missing-title fallback ----------
eq(MusicBarLogic.barState({ ...base, playbackState: 'playing', nowPlaying: { title: '', artist: '' } }).title,
   'Untitled', 'empty title -> Untitled');

process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/music-bar-logic.test.js`
Expected: FAIL — `Cannot find module '../js/music-bar-logic.js'`

- [ ] **Step 3: Write the implementation**

Create `js/music-bar-logic.js`:

```js
// ===== MUSIC BAR STATE MACHINE =====
// Pure function: MusicRemote state snapshot -> what the bar should render.
// No DOM, no Capacitor — unit-tested in node (tests/music-bar-logic.test.js).
//
// Rule order matters:
//   1. Music app actively playing -> transport. (Checked before otherAudioPlaying,
//      because the Music app itself counts as "other audio" to our session.)
//   2. Other audio active -> the Spotify/podcast fallback.
//   3. Music app paused/interrupted -> paused transport IF a queue exists
//      (unauthorized we can't see the queue, but paused implies one).
//   4. Everything else -> "start your music".

const MusicBarLogic = {
  barState(snapshot) {
    const s = snapshot || {};
    if (!s.native) return { mode: 'hidden' };
    const authed = s.authStatus === 'authorized';
    const np = authed && s.nowPlaying ? s.nowPlaying : null;
    const transport = (playing) => ({
      mode: 'transport',
      playing,
      lite: !np,
      title: np ? (np.title || 'Untitled') : 'Music',
      subtitle: np ? (np.artist || '') : '',
      artworkBase64: np ? (np.artworkBase64 || null) : null
    });
    if (s.playbackState === 'playing') return transport(true);
    if (s.otherAudioPlaying) return { mode: 'other-app', showOpenSpotify: !!s.spotifyInstalled };
    if (s.playbackState === 'paused' || s.playbackState === 'interrupted') {
      if (authed && !np) return { mode: 'start-music' };
      return transport(false);
    }
    return { mode: 'start-music' };
  }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = MusicBarLogic; }
if (typeof window !== 'undefined') { window.MusicBarLogic = MusicBarLogic; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/music-bar-logic.test.js`
Expected: all `ok` lines, exit 0. Also run `node tests/run-logic.test.js` — still passes.

- [ ] **Step 5: Commit**

```bash
git add js/music-bar-logic.js tests/music-bar-logic.test.js
git commit -m "feat: music bar state machine with unit tests"
```

---

### Task 2: Native `MusicRemote` plugin

**Files:**
- Create: `ios/App/App/MusicRemotePlugin.swift`
- Modify: `ios/App/App/RIUViewController.swift` (one line)
- Modify: `ios/App/App/Info.plist` (two keys)
- Modify: `ios/App/App.xcodeproj/project.pbxproj` (via ruby script, not by hand)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: Capacitor plugin `MusicRemote` at `window.Capacitor.Plugins.MusicRemote` with methods `getState()`, `play()`, `pause()`, `next()`, `previous()`, `getLibrary({kind: 'albums'|'playlists'}) -> {items: [{id, title, subtitle}]}`, `getCollectionArtwork({kind, id}) -> {artworkBase64: string|null}`, `playCollection({kind, id})`, `requestAuthorization() -> {authStatus}`, `openSpotify()`, `openSettings()`; event `musicStateChanged` whose payload is the same dict `getState()` resolves (the `snapshot` shape Task 1 consumes).

- [ ] **Step 1: Write the plugin**

Create `ios/App/App/MusicRemotePlugin.swift`:

```swift
import Foundation
import Capacitor
import MediaPlayer
import AVFoundation

// In-house Apple Music remote for the in-run music bar: transport control,
// now-playing state, and album/playlist pickup through the system Music app.
// Registered app-locally from RIUViewController — not an npm plugin.
// Never touches library data (nowPlayingItem, MPMediaQuery) unless
// MPMediaLibrary reports .authorized — reading it is what triggers the iOS
// media-library permission prompt. Transport commands are permission-free.
@objc(MusicRemotePlugin)
public class MusicRemotePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MusicRemotePlugin"
    public let jsName = "MusicRemote"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play",                 returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause",                returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "next",                 returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previous",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLibrary",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCollectionArtwork", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playCollection",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSpotify",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings",         returnType: CAPPluginReturnPromise)
    ]

    private var notificationsStarted = false

    // Computed so merely registering the plugin does zero Music-framework work;
    // the system player is first touched when the bar renders and calls getState.
    private var player: MPMusicPlayerController { MPMusicPlayerController.systemMusicPlayer }

    private func ensureNotifications() {
        guard !notificationsStarted else { return }
        notificationsStarted = true
        player.beginGeneratingPlaybackNotifications()
        let center = NotificationCenter.default
        center.addObserver(forName: .MPMusicPlayerControllerPlaybackStateDidChange,
                           object: player, queue: .main) { [weak self] _ in self?.pushState() }
        center.addObserver(forName: .MPMusicPlayerControllerNowPlayingItemDidChange,
                           object: player, queue: .main) { [weak self] _ in self?.pushState() }
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    // MARK: - State

    private func authString() -> String {
        switch MPMediaLibrary.authorizationStatus() {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }

    private func playbackString() -> String {
        switch player.playbackState {
        case .playing, .seekingForward, .seekingBackward: return "playing"
        case .paused: return "paused"
        case .interrupted: return "interrupted"
        default: return "stopped"
        }
    }

    private func artworkBase64(_ artwork: MPMediaItemArtwork?, side: CGFloat) -> String? {
        guard let image = artwork?.image(at: CGSize(width: side, height: side)),
              let data = image.jpegData(compressionQuality: 0.7) else { return nil }
        return data.base64EncodedString()
    }

    private func stateDict() -> [String: Any] {
        var dict: [String: Any] = [
            "native": true,
            "authStatus": authString(),
            "playbackState": playbackString(),
            "otherAudioPlaying": AVAudioSession.sharedInstance().isOtherAudioPlaying,
            "spotifyInstalled": UIApplication.shared.canOpenURL(URL(string: "spotify:")!)
        ]
        if MPMediaLibrary.authorizationStatus() == .authorized, let item = player.nowPlayingItem {
            var np: [String: Any] = [
                "title": item.title ?? "",
                "artist": item.artist ?? item.albumArtist ?? ""
            ]
            if let art = artworkBase64(item.artwork, side: 120) { np["artworkBase64"] = art }
            dict["nowPlaying"] = np
        } else {
            dict["nowPlaying"] = NSNull()
        }
        return dict
    }

    private func pushState() {
        notifyListeners("musicStateChanged", data: stateDict())
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.ensureNotifications()
            call.resolve(self.stateDict())
        }
    }

    // MARK: - Transport (permission-free)

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.player.play(); call.resolve() }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.player.pause(); call.resolve() }
    }

    @objc func next(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.player.skipToNextItem(); call.resolve() }
    }

    // Standard music-app back button: restart the track, or jump to the previous
    // one when under 3 seconds in. (iOS 16-18: assigning nowPlayingItem to jump
    // tracks silently fails — only these skip APIs work.)
    @objc func previous(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.player.currentPlaybackTime > 3.0 {
                self.player.skipToBeginning()
            } else {
                self.player.skipToPreviousItem()
            }
            call.resolve()
        }
    }

    // MARK: - Library (authorization required)

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        MPMediaLibrary.requestAuthorization { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self else { call.resolve(); return }
                self.pushState()
                call.resolve(["authStatus": self.authString()])
            }
        }
    }

    @objc func getLibrary(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "playlists"
        DispatchQueue.main.async {
            guard MPMediaLibrary.authorizationStatus() == .authorized else {
                call.reject("not-authorized"); return
            }
            var rows: [[String: Any]] = []
            if kind == "albums" {
                for c in MPMediaQuery.albums().collections ?? [] {
                    guard let rep = c.representativeItem else { continue }
                    rows.append([
                        "id": String(c.persistentID),
                        "title": rep.albumTitle ?? "Untitled",
                        "subtitle": rep.albumArtist ?? rep.artist ?? ""
                    ])
                }
            } else {
                for c in MPMediaQuery.playlists().collections ?? [] {
                    let name = (c.value(forProperty: MPMediaPlaylistPropertyName) as? String) ?? "Untitled"
                    rows.append([
                        "id": String(c.persistentID),
                        "title": name,
                        "subtitle": "\(c.count) song\(c.count == 1 ? "" : "s")"
                    ])
                }
            }
            call.resolve(["items": rows])
        }
    }

    private func findCollection(kind: String, id: String) -> MPMediaItemCollection? {
        guard let pid = UInt64(id) else { return nil }
        let query = kind == "albums" ? MPMediaQuery.albums() : MPMediaQuery.playlists()
        let prop = kind == "albums" ? MPMediaItemPropertyAlbumPersistentID : MPMediaPlaylistPropertyPersistentID
        query.addFilterPredicate(MPMediaPropertyPredicate(value: NSNumber(value: pid), forProperty: prop))
        return query.collections?.first
    }

    @objc func getCollectionArtwork(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "playlists"
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            guard MPMediaLibrary.authorizationStatus() == .authorized,
                  let collection = self.findCollection(kind: kind, id: id) else {
                call.resolve(["artworkBase64": NSNull()]); return
            }
            let art = self.artworkBase64(collection.representativeItem?.artwork, side: 88)
            call.resolve(["artworkBase64": art ?? NSNull()])
        }
    }

    @objc func playCollection(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "playlists"
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            guard MPMediaLibrary.authorizationStatus() == .authorized,
                  let collection = self.findCollection(kind: kind, id: id), collection.count > 0 else {
                call.reject("collection-not-found"); return
            }
            self.player.setQueue(with: collection)
            self.player.play()
            call.resolve()
        }
    }

    // MARK: - Escapes

    @objc func openSpotify(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: "spotify:"), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }
}
```

- [ ] **Step 2: Register the plugin**

In `ios/App/App/RIUViewController.swift`, inside `capacitorDidLoad()` after the `WatchBridgePlugin` line, add:

```swift
        bridge?.registerPluginInstance(MusicRemotePlugin())
```

- [ ] **Step 3: Add Info.plist keys**

In `ios/App/App/Info.plist`, inside the top-level `<dict>` (e.g. right before the `UIBackgroundModes` key), add:

```xml
	<key>NSAppleMusicUsageDescription</key>
	<string>Run It UP shows what's playing and lets you switch albums or playlists mid-run.</string>
	<key>LSApplicationQueriesSchemes</key>
	<array>
		<string>spotify</string>
	</array>
```

(If `LSApplicationQueriesSchemes` already exists, append the `<string>spotify</string>` entry instead — as of this writing it does not exist.)

- [ ] **Step 4: Add the file to the Xcode project**

Never hand-edit pbxproj. Run this (xcodeproj gem is already used by `scripts/add-widget-target.rb`):

```bash
ruby -e '
require "xcodeproj"
proj = Xcodeproj::Project.open("ios/App/App.xcodeproj")
target = proj.targets.find { |t| t.name == "App" }
group = proj.main_group["App"]
abort("group not found") unless group
abort("already added") if group.files.any? { |f| f.path == "MusicRemotePlugin.swift" }
file = group.new_file("MusicRemotePlugin.swift")
target.add_file_references([file])
proj.save
puts "added"
'
grep -c "MusicRemotePlugin.swift" ios/App/App.xcodeproj/project.pbxproj
```

Expected: `added`, then a count >= 2 (file ref + build phase).

- [ ] **Step 5: Verify it builds**

```bash
cd ios/App && xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator -configuration Debug build 2>&1 | tail -5; cd ../..
```

Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 6: Commit**

```bash
git add ios/App/App/MusicRemotePlugin.swift ios/App/App/RIUViewController.swift ios/App/App/Info.plist ios/App/App.xcodeproj/project.pbxproj
git commit -m "feat: MusicRemote plugin — Apple Music transport, library picker, Spotify detection"
```

---

### Task 3: Music bar UI module

**Files:**
- Create: `js/music-bar.js`
- Modify: `css/home.css` (append styles)
- Modify: `index.html` (two script tags)
- Modify: `js/run-tracker.js` (two one-line mount calls)

**Interfaces:**
- Consumes: `MusicBarLogic.barState(snapshot)` (Task 1); plugin `MusicRemote` methods/event (Task 2); globals `escapeHtml` (js/supabase.js).
- Produces: `window.MusicBar` with `mount(overlayEl)`, `refresh()`, `toggle()`, `prev()`, `next()`, `openPicker()`, `closePicker()`, `setPickerTab(kind)`, `setPickerFilter(value)`, `pickCollection(kind, id)`, `openSpotify()`, `openSettings()`. Task 4 fills in the picker bodies; this task ships them as stubs that only `console.warn`, EXCEPT `openPicker/closePicker` which Task 4 replaces entirely — keep their Task-3 bodies as no-ops.

- [ ] **Step 1: Write `js/music-bar.js`**

```js
// ===== IN-RUN MUSIC BAR =====
// Apple Music transport + picker on the run screens, via the app-local
// MusicRemote plugin. Strictly additive: run-tracker only ever calls
// window.MusicBar?.mount?.(overlay); every failure degrades or hides the bar.
// window.__MUSIC_MOCK__ (tests/music-bar-harness.html) stands in for the
// plugin so every visual state is exercisable off-device.

const MusicBar = (() => {
  const remote = () => window.__MUSIC_MOCK__ || window.Capacitor?.Plugins?.MusicRemote;
  const available = () =>
    !!(window.__MUSIC_MOCK__ || (window.Capacitor?.isNativePlatform() && window.Capacitor.Plugins?.MusicRemote));

  let lastState = null;       // last plugin snapshot (raw dict)
  let listenerAttached = false;

  const ICONS = {
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zM20 6v12l-9-6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zM4 6v12l9-6z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>'
  };

  async function mount(overlay) {
    if (!available()) return;
    const anchor = overlay?.querySelector?.('.rt-actions');
    if (!anchor || document.getElementById('music-bar')) return;
    const el = document.createElement('div');
    el.id = 'music-bar';
    el.className = 'music-bar';
    el.hidden = true;
    anchor.insertAdjacentElement('beforebegin', el);
    _attachListeners();
    refresh();
  }

  function _attachListeners() {
    if (listenerAttached) return;
    listenerAttached = true;
    try {
      remote().addListener?.('musicStateChanged', (s) => _render(s));
      // The WebView misses events while backgrounded — re-sync on return.
      window.Capacitor?.Plugins?.App?.addListener?.('appStateChange', (st) => {
        if (st.isActive) refresh();
      });
    } catch (err) { console.warn('[music-bar]', err); }
  }

  async function refresh() {
    if (!available()) return;
    try { _render(await remote().getState()); }
    catch (err) { console.warn('[music-bar]', err); _render(null); }
  }

  function _render(snapshot) {
    lastState = snapshot;
    const el = document.getElementById('music-bar');
    if (!el) return;
    const s = MusicBarLogic.barState(snapshot);
    if (s.mode === 'hidden') { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    if (s.mode === 'transport') {
      el.innerHTML = `
        <button class="mb-info" onclick="MusicBar.openPicker()" aria-label="Choose music">
          <div class="mb-art">${s.artworkBase64
            ? `<img src="data:image/jpeg;base64,${s.artworkBase64}" alt="">`
            : ICONS.note}</div>
          <div class="mb-meta">
            <div class="mb-title">${escapeHtml(s.title)}</div>
            ${s.subtitle ? `<div class="mb-sub">${escapeHtml(s.subtitle)}</div>` : ''}
          </div>
        </button>
        <div class="mb-controls">
          <button class="mb-btn" onclick="MusicBar.prev()" aria-label="Previous">${ICONS.prev}</button>
          <button class="mb-btn mb-btn-main" onclick="MusicBar.toggle()"
            aria-label="${s.playing ? 'Pause' : 'Play'}">${s.playing ? ICONS.pause : ICONS.play}</button>
          <button class="mb-btn" onclick="MusicBar.next()" aria-label="Next">${ICONS.next}</button>
        </div>`;
    } else if (s.mode === 'other-app') {
      el.innerHTML = `
        <div class="mb-other">
          <span class="mb-other-label">Playing in another app</span>
          ${s.showOpenSpotify
            ? '<button class="mb-spotify" onclick="MusicBar.openSpotify()">OPEN SPOTIFY</button>'
            : ''}
        </div>`;
    } else { // start-music
      el.innerHTML = `
        <button class="mb-start" onclick="MusicBar.openPicker()">
          ${ICONS.note}<span>Start your music</span>
        </button>`;
    }
  }

  async function _command(name) {
    try { await remote()[name](); refresh(); }
    catch (err) { console.warn('[music-bar]', err); }
  }

  async function toggle() {
    if (lastState?.playbackState === 'playing') await _command('pause');
    else await _command('play');
  }

  async function openSpotify() {
    try { await remote().openSpotify(); } catch (err) { console.warn('[music-bar]', err); }
  }

  async function openSettings() {
    try { await remote().openSettings(); } catch (err) { console.warn('[music-bar]', err); }
  }

  // Picker — implemented in the next task.
  function openPicker() {}
  function closePicker() {}
  function setPickerTab() {}
  function setPickerFilter() {}
  function pickCollection() {}

  return {
    mount, refresh, toggle,
    prev: () => _command('previous'),
    next: () => _command('next'),
    openPicker, closePicker, setPickerTab, setPickerFilter, pickCollection,
    openSpotify, openSettings,
    _render // exposed for the harness's direct state injection
  };
})();

window.MusicBar = MusicBar;
```

- [ ] **Step 2: Append styles to `css/home.css`**

```css
/* ===== In-run music bar ===== */
.music-bar {
  width: min(340px, calc(100vw - 48px));
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--color-surface);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
}
.mb-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  color: var(--color-text);
}
.mb-art {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  overflow: hidden;
}
.mb-art img { width: 100%; height: 100%; object-fit: cover; }
.mb-art svg { width: 18px; height: 18px; }
.mb-meta { min-width: 0; }
.mb-title {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mb-sub {
  font-size: 11px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mb-controls { display: flex; align-items: center; gap: var(--space-xs); flex-shrink: 0; }
.mb-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--radius-full);
  background: none;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mb-btn svg { width: 20px; height: 20px; }
.mb-btn:active { opacity: 0.6; }
.mb-btn-main { background: var(--color-primary); color: var(--color-bg); }
.mb-other {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.mb-other-label { font-size: 13px; color: var(--color-text-muted); }
.mb-spotify {
  border: 1px solid var(--color-primary);
  background: none;
  color: var(--color-primary);
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.06em;
  padding: 6px 12px;
  border-radius: var(--radius-full);
}
.mb-spotify:active { opacity: 0.7; }
.mb-start {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 14px;
  padding: var(--space-sm) 0;
}
.mb-start svg { width: 16px; height: 16px; }
.mb-start:active { opacity: 0.7; }
```

- [ ] **Step 3: Wire the script tags**

In `index.html`, after the `js/voice-coach.js` line, add:

```html
  <script src="js/music-bar-logic.js" defer></script>
  <script src="js/music-bar.js" defer></script>
```

- [ ] **Step 4: Mount from the run screens**

In `js/run-tracker.js`:

1. End of `showRunTrackerUI()` — after `document.body.appendChild(overlay);` add:

```js
  window.MusicBar?.mount?.(overlay);
```

2. In `openRunTrackerPrep()` — after `_initGoalChips(overlay);` add:

```js
  window.MusicBar?.mount?.(overlay);
```

- [ ] **Step 5: Verify**

```bash
node --check js/music-bar.js && node --check js/music-bar-logic.js
node tests/music-bar-logic.test.js && node tests/run-logic.test.js
npm run build
```

Expected: syntax OK, all tests pass, build copies cleanly. Then serve the web build (`npx http-server www -p 8080` or existing flow) and confirm in a browser: run screens unchanged, **no** music bar (web is not native), zero console errors.

- [ ] **Step 6: Commit**

```bash
git add js/music-bar.js js/music-bar-logic.js css/home.css index.html js/run-tracker.js
git commit -m "feat: in-run music bar — transport UI, Spotify fallback, run-screen mounts"
```

---

### Task 4: Mock harness for all bar states

**Files:**
- Create: `tests/music-bar-harness.html`

**Interfaces:**
- Consumes: `window.MusicBar` (Task 3), `MusicBarLogic` (Task 1).
- Produces: `makeMusicMock(state)` — a full stand-in for the plugin (also used to manually exercise the picker in Task 5). The harness page IS the off-device verification vehicle: open it in any browser, click through states.

- [ ] **Step 1: Write the harness**

Create `tests/music-bar-harness.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Music Bar Harness</title>
<link rel="stylesheet" href="../css/variables.css">
<link rel="stylesheet" href="../css/home.css">
<style>
  body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body, sans-serif); padding: 24px; }
  .state-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .state-btns button { padding: 8px 12px; border-radius: 8px; border: 1px solid #444; background: #1A1A1A; color: #fff; }
  /* Fake run overlay so MusicBar.mount finds its anchor */
  #fake-overlay { position: relative; width: 360px; padding: 16px; border: 1px dashed #333; border-radius: 12px; }
  .rt-actions { display: flex; gap: 8px; }
  .rt-actions button { flex: 1; padding: 12px; border-radius: 8px; border: none; background: #252525; color: #888; }
</style>
</head>
<body>
<h1>Music Bar Harness</h1>
<p>Every state the bar can render, driven by a mock plugin. No device needed.</p>
<div class="state-btns">
  <button onclick="setState('playing')">Playing (full)</button>
  <button onclick="setState('paused')">Paused (full)</button>
  <button onclick="setState('lite')">Playing, no permission</button>
  <button onclick="setState('spotify')">Other app + Spotify</button>
  <button onclick="setState('other')">Other app, no Spotify</button>
  <button onclick="setState('empty')">Nothing playing</button>
  <button onclick="setState('denied-empty')">Denied + nothing playing</button>
</div>
<div id="fake-overlay">
  <div class="rt-actions"><button>PAUSE</button><button>STOP RUN</button></div>
</div>

<script src="../js/music-bar-logic.js"></script>
<script>
// escapeHtml normally comes from js/supabase.js; the harness supplies its own.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

const MOCK_PLAYLISTS = [
  { id: '1', title: 'Run It UP Radio', subtitle: '42 songs' },
  { id: '2', title: 'Tempo 180', subtitle: '31 songs' },
  { id: '3', title: '<script>alert(1)</script>', subtitle: 'XSS check — must render as text' }
];
const MOCK_ALBUMS = [
  { id: '10', title: 'DAMN.', subtitle: 'Kendrick Lamar' },
  { id: '11', title: 'Renaissance', subtitle: 'Beyoncé' }
];

function makeMusicMock(state) {
  return {
    _state: state,
    _listeners: [],
    async getState() { return { ...this._state }; },
    async addListener(name, cb) { this._listeners.push(cb); return { remove() {} }; },
    _push() { const s = { ...this._state }; this._listeners.forEach(cb => cb(s)); },
    async play() { this._state.playbackState = 'playing'; this._push(); },
    async pause() { this._state.playbackState = 'paused'; this._push(); },
    async next() { console.log('[mock] next'); },
    async previous() { console.log('[mock] previous'); },
    async requestAuthorization() {
      this._state.authStatus = 'authorized'; this._push();
      return { authStatus: 'authorized' };
    },
    async getLibrary({ kind }) { return { items: kind === 'albums' ? MOCK_ALBUMS : MOCK_PLAYLISTS }; },
    async getCollectionArtwork() { return { artworkBase64: null }; },
    async playCollection({ kind, id }) {
      console.log('[mock] playCollection', kind, id);
      this._state.playbackState = 'playing';
      this._state.nowPlaying = { title: 'First Track', artist: 'Mock Artist' };
      this._push();
    },
    async openSpotify() { console.log('[mock] open spotify'); },
    async openSettings() { console.log('[mock] open settings'); }
  };
}

const STATES = {
  playing: { native: true, authStatus: 'authorized', playbackState: 'playing', otherAudioPlaying: true,
             spotifyInstalled: true, nowPlaying: { title: 'HUMBLE.', artist: 'Kendrick Lamar', artworkBase64: null } },
  paused:  { native: true, authStatus: 'authorized', playbackState: 'paused', otherAudioPlaying: false,
             spotifyInstalled: true, nowPlaying: { title: 'HUMBLE.', artist: 'Kendrick Lamar', artworkBase64: null } },
  lite:    { native: true, authStatus: 'notDetermined', playbackState: 'playing', otherAudioPlaying: true,
             spotifyInstalled: false, nowPlaying: null },
  spotify: { native: true, authStatus: 'authorized', playbackState: 'stopped', otherAudioPlaying: true,
             spotifyInstalled: true, nowPlaying: null },
  other:   { native: true, authStatus: 'authorized', playbackState: 'stopped', otherAudioPlaying: true,
             spotifyInstalled: false, nowPlaying: null },
  empty:   { native: true, authStatus: 'authorized', playbackState: 'stopped', otherAudioPlaying: false,
             spotifyInstalled: true, nowPlaying: null },
  'denied-empty': { native: true, authStatus: 'denied', playbackState: 'stopped', otherAudioPlaying: false,
             spotifyInstalled: false, nowPlaying: null }
};

window.__MUSIC_MOCK__ = makeMusicMock({ ...STATES.playing });
function setState(name) {
  window.__MUSIC_MOCK__._state = { ...STATES[name] };
  MusicBar.refresh();
}
</script>
<script src="../js/music-bar.js"></script>
<script>
  MusicBar.mount(document.getElementById('fake-overlay'));
</script>
</body>
</html>
```

- [ ] **Step 2: Verify every state renders**

Open `tests/music-bar-harness.html` in a browser (`open tests/music-bar-harness.html` or via Playwright). Click each state button and confirm:
- Playing (full): artwork placeholder note icon, "HUMBLE." / "Kendrick Lamar", prev + pause + next buttons.
- Paused (full): same but play icon.
- Playing, no permission: title "Music", no subtitle, controls work (toggle flips icon).
- Other app + Spotify: "Playing in another app" + OPEN SPOTIFY button, console logs on tap.
- Other app, no Spotify: label only, no button.
- Nothing playing / Denied + nothing playing: "Start your music" (picker is a no-op until the next task).
- Zero console errors throughout.

- [ ] **Step 3: Commit**

```bash
git add tests/music-bar-harness.html
git commit -m "test: music bar mock harness — every bar state off-device"
```

---

### Task 5: Picker sheet (Playlists | Albums)

**Files:**
- Modify: `js/music-bar.js` (replace the picker stubs)
- Modify: `css/home.css` (append picker styles)
- Modify: `tests/music-bar-harness.html` (only if a fix requires it — the mock already serves the picker)

**Interfaces:**
- Consumes: `remote().requestAuthorization/getLibrary/getCollectionArtwork/playCollection/openSettings` (Task 2 / Task 4 mock).
- Produces: working `MusicBar.openPicker()`, `closePicker()`, `setPickerTab(kind)`, `setPickerFilter(value)`, `pickCollection(kind, id)`.

- [ ] **Step 1: Replace the picker stubs in `js/music-bar.js`**

Replace the five stub functions (`openPicker`, `closePicker`, `setPickerTab`, `setPickerFilter`, `pickCollection`) with:

```js
  // ---- Picker sheet (Playlists | Albums) ----
  const picker = { kind: 'playlists', filter: '', cache: { playlists: null, albums: null } };

  // Row artwork loads lazily as rows scroll into view — a 400-album library
  // must never stall the bridge with hundreds of image fetches up front.
  const _artObserver = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const artEl = entry.target;
          _artObserver.unobserve(artEl);
          remote().getCollectionArtwork({ kind: artEl.dataset.kind, id: artEl.dataset.id })
            .then((res) => {
              if (res?.artworkBase64) {
                artEl.textContent = '';
                artEl.style.backgroundImage = `url(data:image/jpeg;base64,${res.artworkBase64})`;
              }
            })
            .catch(() => {});
        }
      })
    : null;

  async function openPicker() {
    if (!available() || document.getElementById('music-picker')) return;
    let auth = lastState?.authStatus;
    if (auth !== 'authorized') {
      try { auth = (await remote().requestAuthorization())?.authStatus; }
      catch (err) { console.warn('[music-bar]', err); auth = 'denied'; }
      refresh();
    }
    _openSheet(auth === 'authorized');
    if (auth === 'authorized') setPickerTab(picker.kind);
  }

  function _openSheet(authorized) {
    const host = document.getElementById('run-tracker-overlay') || document.getElementById('music-bar')?.parentElement;
    if (!host) return;
    const sheet = document.createElement('div');
    sheet.id = 'music-picker';
    sheet.className = 'music-picker';
    if (authorized) {
      sheet.innerHTML = `
        <div class="mp-backdrop" onclick="MusicBar.closePicker()"></div>
        <div class="mp-sheet">
          <div class="mp-tabs">
            <button id="mp-tab-playlists" class="mp-tab" onclick="MusicBar.setPickerTab('playlists')">PLAYLISTS</button>
            <button id="mp-tab-albums" class="mp-tab" onclick="MusicBar.setPickerTab('albums')">ALBUMS</button>
          </div>
          <input id="mp-filter" class="mp-filter" type="search" placeholder="Filter"
            oninput="MusicBar.setPickerFilter(this.value)">
          <div id="mp-list" class="mp-list"></div>
        </div>`;
    } else {
      sheet.innerHTML = `
        <div class="mp-backdrop" onclick="MusicBar.closePicker()"></div>
        <div class="mp-sheet mp-sheet-denied">
          <div class="mp-denied-text">Music access is off — Run It UP can't show your playlists or albums.</div>
          <button class="btn-secondary" onclick="MusicBar.openSettings()">OPEN SETTINGS</button>
        </div>`;
    }
    host.appendChild(sheet);
  }

  function closePicker() {
    document.getElementById('music-picker')?.remove();
  }

  async function setPickerTab(kind) {
    picker.kind = kind;
    document.getElementById('mp-tab-playlists')?.classList.toggle('active', kind === 'playlists');
    document.getElementById('mp-tab-albums')?.classList.toggle('active', kind === 'albums');
    if (!picker.cache[kind]) {
      try { picker.cache[kind] = (await remote().getLibrary({ kind }))?.items || []; }
      catch (err) { console.warn('[music-bar]', err); picker.cache[kind] = []; }
    }
    _renderPickerList();
  }

  function setPickerFilter(value) {
    picker.filter = value || '';
    _renderPickerList();
  }

  function _renderPickerList() {
    const list = document.getElementById('mp-list');
    if (!list) return;
    const all = picker.cache[picker.kind] || [];
    const f = picker.filter.trim().toLowerCase();
    const items = f ? all.filter((i) => `${i.title} ${i.subtitle}`.toLowerCase().includes(f)) : all;
    list.textContent = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'mp-empty';
      empty.textContent = all.length
        ? 'No matches.'
        : 'Nothing in your library yet — add music in Apple Music.';
      list.appendChild(empty);
      return;
    }
    // DOM-built rows: library titles are untrusted text, textContent keeps them inert.
    for (const item of items) {
      const row = document.createElement('button');
      row.className = 'mp-row';
      row.onclick = () => pickCollection(picker.kind, item.id);
      const art = document.createElement('div');
      art.className = 'mp-art';
      art.dataset.kind = picker.kind;
      art.dataset.id = item.id;
      const meta = document.createElement('div');
      meta.className = 'mp-meta';
      const t = document.createElement('div');
      t.className = 'mp-title';
      t.textContent = item.title;
      const sub = document.createElement('div');
      sub.className = 'mp-sub';
      sub.textContent = item.subtitle;
      meta.append(t, sub);
      row.append(art, meta);
      list.appendChild(row);
      _artObserver?.observe(art);
    }
  }

  async function pickCollection(kind, id) {
    try { await remote().playCollection({ kind, id }); }
    catch (err) { console.warn('[music-bar]', err); } // quiet by design: no toasts mid-run
    closePicker();
    refresh();
  }
```

Also update the returned API object — the picker names now bind to the real functions (the object literal already lists them; just ensure no stub remains).

- [ ] **Step 2: Append picker styles to `css/home.css`**

```css
/* ===== Music picker sheet ===== */
.music-picker { position: absolute; inset: 0; z-index: 30; }
.mp-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.6); }
.mp-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 70%;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-md) var(--space-md) calc(var(--space-md) + var(--safe-area-bottom));
}
.mp-tabs { display: flex; gap: var(--space-sm); margin-bottom: var(--space-sm); }
.mp-tab {
  flex: 1;
  padding: 10px 0;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.08em;
}
.mp-tab.active { background: var(--color-primary); color: var(--color-bg); }
.mp-filter {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  padding: 10px 12px;
  margin-bottom: var(--space-sm);
}
.mp-list { overflow-y: auto; -webkit-overflow-scrolling: touch; }
.mp-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: none;
  border: none;
  padding: var(--space-sm) 0;
  text-align: left;
  color: var(--color-text);
}
.mp-row:active { opacity: 0.6; }
.mp-row .mp-art {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background-color: var(--color-bg);
  background-size: cover;
  background-position: center;
}
.mp-row .mp-meta { min-width: 0; }
.mp-row .mp-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-row .mp-sub { font-size: 12px; color: var(--color-text-muted); }
.mp-empty { padding: var(--space-lg) 0; text-align: center; color: var(--color-text-muted); font-size: 14px; }
.mp-sheet-denied { gap: var(--space-md); align-items: center; text-align: center; }
.mp-denied-text { color: var(--color-text-muted); font-size: 14px; }
```

- [ ] **Step 3: Verify in the harness**

```bash
node --check js/music-bar.js && node tests/music-bar-logic.test.js
```

Then open `tests/music-bar-harness.html` and confirm:
- From "Nothing playing": tap Start your music → sheet opens, PLAYLISTS tab active, three mock playlists listed — **the XSS row renders as literal text** (`<script>alert(1)</script>` visible, no alert).
- ALBUMS tab → two albums. Filter "dam" → only DAMN.; filter "zzz" → "No matches."
- Tap a playlist → console logs `playCollection`, sheet closes, bar flips to playing "First Track".
- From "Denied + nothing playing": tap Start your music → mock auto-authorizes (that's mock behavior; the real denied path is device-verified in Task 6) — to see the denied sheet, temporarily edit the mock's `requestAuthorization` to return `denied` and confirm the "Music access is off" sheet with OPEN SETTINGS appears. Revert the edit.
- Backdrop tap closes the sheet. Zero console errors.

- [ ] **Step 4: Sync the web build**

```bash
npm run build
```

Expected: clean copy (music-bar files now ship in `www/`).

- [ ] **Step 5: Commit**

```bash
git add js/music-bar.js css/home.css
git commit -m "feat: music picker sheet — playlists/albums tabs, filter, lazy artwork, denied state"
```

---

### Task 6: Device verification gate (Nelson's iPhone)

**Files:**
- None created — this is the on-device pass the whole feature gates on. The iOS Simulator has **no Music app**; nothing before this step has proven the native path.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified feature. **Do not mark this plan complete, and do not ship v1.5, until every box below is checked on hardware.**

- [ ] **Step 1: Build onto the device**

```bash
npm run build && npx cap sync ios
```

Then open `ios/App/App.xcworkspace` in Xcode and run the App scheme on the physical iPhone.

- [ ] **Step 2: Permission assumption check (FIRST — the UX rests on it)**

Delete the app first if a previous build granted permission (Settings → Apps → Run It UP has a Media & Apple Music row once prompted). On a clean install: start Apple Music playing, open READY TO RUN, tap play/pause/skip on the bar.
Expected: **no permission prompt appears**, transport works, and the bar correctly shows play vs pause icon (playbackState readable). If a prompt DOES appear here, stop and flag it — the lite-mode design needs rework before proceeding.

- [ ] **Step 3: Full transport + metadata mid-run**

Tap the bar's track-info area → iOS media-library prompt appears with the exact usage string → Allow → artwork/title/artist appear. Start a short run. Verify: skip advances tracks and the bar updates live; back restarts the track (>3 s in) and jumps back (tapped again quickly); pause/play works; lock the phone, unlock — bar state still correct (appStateChange refresh).

- [ ] **Step 4: Picker**

Open picker mid-run: playlists list, albums list, artwork thumbnails fill in as you scroll, filter narrows, tapping an album switches playback to it and closes the sheet. Voice coach still ducks the new music at the next milestone.

- [ ] **Step 5: Spotify fallback**

Play something in Spotify, return to the run screen. Expected: bar shows "Playing in another app" + OPEN SPOTIFY; tapping it lands in Spotify. Quit Spotify, pause all audio → bar shows "Start your music."

- [ ] **Step 6: Denied path**

Settings → Run It UP → Media & Apple Music → off. Bar falls back to lite/generic; picker tap shows "Music access is off" → OPEN SETTINGS lands on the app's settings page. Re-enable.

- [ ] **Step 7: Run integrity regression**

One short outdoor run end-to-end with music controls used throughout: distance tracks, auto-pause still works, voice coach speaks, run saves (row lands in Supabase). Existing behavior must be byte-for-byte normal.

- [ ] **Step 8: Commit any device-found fixes and close out**

```bash
git add -A && git commit -m "fix: device-test findings for in-run music controls"
git push
```

---

## Self-review notes (completed)

- **Spec coverage:** bar placement + 4 states (T3), picker w/ tabs+filter (T5), permissions flow (T2 native, T5 denied sheet, T6 verification), Spotify fallback (T2 `openSpotify` + T3 render + T6 device check), lazy artwork (T5), mock mode (T4), pure state machine tests (T1), additive-only run-tracker touch (T3, two optional-chained lines), Info.plist strings verbatim (T2). Settings deep link required adding `openSettings()` to the plugin — spec's method list amended by this plan (spec's error-handling section already required the behavior).
- **Placeholder scan:** none — every step has full code or an exact command with expected output.
- **Type consistency:** `snapshot` dict shape identical across plugin `stateDict()` (T2), `barState()` input (T1), harness `STATES` (T4). Picker method names identical in T3 API object, T5 implementations, and inline `onclick` strings. `kind` values `'albums'|'playlists'` everywhere.

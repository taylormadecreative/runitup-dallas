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
      const safeArt = s.artworkBase64 && /^[A-Za-z0-9+/=]+$/.test(s.artworkBase64) ? s.artworkBase64 : null;
      el.innerHTML = `
        <button class="mb-info" onclick="MusicBar.openPicker()" aria-label="Choose music">
          <div class="mb-art">${safeArt
            ? `<img src="data:image/jpeg;base64,${safeArt}" alt="">`
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

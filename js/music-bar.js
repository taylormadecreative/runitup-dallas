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
              const safeArt = res?.artworkBase64 && /^[A-Za-z0-9+/=]+$/.test(res.artworkBase64) ? res.artworkBase64 : null;
              if (safeArt) {
                artEl.textContent = '';
                artEl.style.backgroundImage = `url(data:image/jpeg;base64,${safeArt})`;
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
    if (!host || document.getElementById('music-picker')) return;
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
    _artObserver?.disconnect();
    picker.filter = '';
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
    _artObserver?.disconnect();
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

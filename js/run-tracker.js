// ===== GPS RUN TRACKER =====
// Live tracking: distance (miles), duration (seconds), current pace (min/mile)
// Uses @capacitor/geolocation on native, navigator.geolocation on web.

const RUN_STATE = {
  status: 'idle', // 'idle' | 'tracking' | 'paused' (manual, sticky) | 'autopaused' (GPS says stopped)
  startedAt: null,
  pausedAt: null,
  totalPausedMs: 0,
  distanceMeters: 0,
  lastPoint: null,      // { lat, lng, time }
  points: [],           // sampled route points
  timerInterval: null,
  watchId: null,
  wakeLock: null,
  goalMiles: null,      // distance goal for this run (null = just run)
  milestone: null,      // RunLogic milestone engine
  autoPause: null,      // RunLogic auto-pause detector
  engineListener: null, // RunEngine 'location' listener handle
  lastSnapshotAt: 0,
  lastUI: { miles: 0, seconds: 0, paceSecPerMile: null }
};

// Event bus for voice coach + Live Activity. Listeners register objects with
// any of: onRunStart({goalMiles}), onMilestones(utterances),
// onStatusChange(status, ctx?), onSample(stats).
const RunTrackerEvents = {
  listeners: [],
  emit(name, ...args) {
    for (const l of this.listeners) {
      try { l[name]?.(...args); } catch (err) { console.warn('[run-events]', err); }
    }
  }
};
window.RunTrackerEvents = RunTrackerEvents;

// Settings with default-on semantics ('riu_voice_coach', 'riu_auto_pause')
function riuSetting(key) {
  const v = localStorage.getItem(key);
  return v === null ? 'on' : v;
}

function setRunGoal(v) {
  const n = parseFloat(v);
  RUN_STATE.goalMiles = (isFinite(n) && n > 0) ? n : null;
  try { localStorage.setItem('riu_last_goal', RUN_STATE.goalMiles ?? ''); } catch {}
}

// Persistent warmer — kept active while the app is in foreground so a first GPS
// fix is already available when the user taps START RUN.
const GPS_WARMER = {
  permission: 'unknown', // 'granted' | 'denied' | 'prompt' | 'unknown'
  lastPosition: null,
  lastPositionAt: 0,
  watchId: null,
  enabled: false
};

const METERS_PER_MILE = 1609.344;
const MIN_ACCURACY_M = 50;          // Ignore GPS points worse than 50m (first-lock tolerant)
const MIN_POINT_DISTANCE_M = 5;     // Ignore jittery moves < 5m
const WARM_FIX_MAX_ACCURACY_M = 35; // 'GPS locked' requires a fix at least this accurate

function _haversineMeters(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function _elapsedMs() {
  if (!RUN_STATE.startedAt) return 0;
  const frozen = RUN_STATE.status === 'paused' || RUN_STATE.status === 'autopaused';
  const now = frozen ? RUN_STATE.pausedAt : Date.now();
  return now - RUN_STATE.startedAt - RUN_STATE.totalPausedMs;
}

function _formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function _formatPace(secPerMile) {
  if (!isFinite(secPerMile) || secPerMile <= 0) return '--\'--"';
  const m = Math.floor(secPerMile / 60);
  const s = Math.floor(secPerMile % 60);
  return `${m}'${String(s).padStart(2,'0')}"`;
}

function _computeStats() {
  const miles = RUN_STATE.distanceMeters / METERS_PER_MILE;
  const seconds = _elapsedMs() / 1000;
  const paceSecPerMile = miles > 0.01 ? seconds / miles : null;
  return { miles, seconds, paceSecPerMile };
}

function _updateTrackerUI() {
  const { miles, seconds, paceSecPerMile } = _computeStats();
  RUN_STATE.lastUI = { miles, seconds, paceSecPerMile };
  const distEl = document.getElementById('rt-distance');
  const timeEl = document.getElementById('rt-time');
  const paceEl = document.getElementById('rt-pace');
  if (distEl) distEl.textContent = miles.toFixed(2);
  if (timeEl) timeEl.textContent = _formatDuration(seconds * 1000);
  if (paceEl) paceEl.textContent = _formatPace(paceSecPerMile);
  const ring = document.getElementById('rt-ring-fill');
  if (ring && RUN_STATE.goalMiles) {
    const RING_C = 565.49;
    const progress = Math.min(1, miles / RUN_STATE.goalMiles);
    ring.style.strokeDashoffset = String(RING_C * (1 - progress));
  }
  const badge = document.getElementById('rt-autopause-badge');
  if (badge) badge.hidden = RUN_STATE.status !== 'autopaused';
}

function _onPosition(coords, timestamp) {
  if (!coords) return;
  if (RUN_STATE.status !== 'tracking' && RUN_STATE.status !== 'idle') return; // don't record pause detours in the route
  const accuracy = coords.accuracy ?? coords.accuracyM ?? 999;
  if (accuracy > MIN_ACCURACY_M) return; // drop noisy fixes
  const point = { lat: coords.latitude, lng: coords.longitude, time: timestamp || Date.now() };

  if (RUN_STATE.lastPoint && RUN_STATE.status === 'tracking') {
    const d = _haversineMeters(RUN_STATE.lastPoint, point);
    if (d >= MIN_POINT_DISTANCE_M) {
      RUN_STATE.distanceMeters += d;
      RUN_STATE.points.push(point);
      RUN_STATE.lastPoint = point;
      _updateTrackerUI();
      const stats = _computeStats();
      if (RUN_STATE.milestone) {
        const utterances = RUN_STATE.milestone.onSample({ miles: stats.miles, elapsedMs: _elapsedMs() });
        if (utterances.length) RunTrackerEvents.emit('onMilestones', utterances);
      }
      RunTrackerEvents.emit('onSample', stats);
      _snapshotLiveRun(false);
    }
  } else {
    RUN_STATE.lastPoint = point;
    RUN_STATE.points.push(point);
  }
}

// Native fixes from RunEngine: auto-pause decisions first, then the shared pipeline.
function _onEngineFix(fix) {
  if (RUN_STATE.status === 'idle') return;
  if (RUN_STATE.autoPause && riuSetting('riu_auto_pause') === 'on' &&
      (RUN_STATE.status === 'tracking' || RUN_STATE.status === 'autopaused')) {
    const action = RUN_STATE.autoPause.onFix({
      speedMps: fix.speedMps ?? -1,
      accuracyM: fix.accuracy ?? 999,
      tMs: fix.timestamp || Date.now(),
      status: RUN_STATE.status
    });
    if (action === 'pause') _autoPause();
    else if (action === 'resume') _autoResume();
  }
  _onPosition({ latitude: fix.lat, longitude: fix.lng, accuracy: fix.accuracy }, fix.timestamp);
}

async function _startWatchPosition() {
  const nativeGeo = window.Capacitor?.Plugins?.Geolocation;
  const runEngine = window.Capacitor?.Plugins?.RunEngine;
  // iOS: RunEngine keeps GPS alive with the screen locked / app backgrounded.
  if (window.Capacitor?.isNativePlatform() && runEngine) {
    const perm = await nativeGeo?.requestPermissions({ permissions: ['location'] });
    if (perm && perm.location === 'denied') throw new Error('Location permission denied');
    RUN_STATE.engineListener = await runEngine.addListener('location', _onEngineFix);
    await runEngine.startTracking();
    return;
  }
  // Android (no RunEngine): previous foreground-only behavior.
  if (window.Capacitor?.isNativePlatform() && nativeGeo) {
    try {
      const perm = await nativeGeo.requestPermissions({ permissions: ['location'] });
      if (perm?.location !== 'granted' && perm?.location !== 'prompt' && perm?.location !== 'prompt-with-rationale') {
        throw new Error('Location permission denied');
      }
      RUN_STATE.watchId = await nativeGeo.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (position, err) => {
          if (err) { console.warn('[run-tracker] watch err', err); return; }
          if (position?.coords) _onPosition(position.coords, position.timestamp);
        }
      );
      return;
    } catch (err) {
      console.error('[run-tracker] native geo failed', err);
      throw err;
    }
  }
  // Web fallback
  if (!navigator.geolocation) throw new Error('Geolocation not available');
  RUN_STATE.watchId = navigator.geolocation.watchPosition(
    pos => _onPosition(pos.coords, pos.timestamp),
    err => console.warn('[run-tracker] web geo err', err),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );
}

async function _stopWatchPosition() {
  const nativeGeo = window.Capacitor?.Plugins?.Geolocation;
  const runEngine = window.Capacitor?.Plugins?.RunEngine;
  if (RUN_STATE.engineListener) {
    try { await RUN_STATE.engineListener.remove(); } catch {}
    RUN_STATE.engineListener = null;
    try { await runEngine?.stopTracking(); } catch {}
  }
  if (RUN_STATE.watchId != null) {
    if (window.Capacitor?.isNativePlatform() && nativeGeo) {
      try { await nativeGeo.clearWatch({ id: RUN_STATE.watchId }); } catch {}
    } else if (navigator.geolocation) {
      navigator.geolocation.clearWatch(RUN_STATE.watchId);
    }
    RUN_STATE.watchId = null;
  }
}

async function _requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      RUN_STATE.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {}
}

async function _releaseWakeLock() {
  try { await RUN_STATE.wakeLock?.release?.(); } catch {}
  RUN_STATE.wakeLock = null;
}

// ===== LIVE-RUN PERSISTENCE =====
// The in-progress run is snapshotted to localStorage so a crash or an iOS
// memory kill never erases a run — relaunching offers to pick it back up.
const LIVE_RUN_KEY = 'riu_live_run';

function _snapshotLiveRun(force) {
  if (RUN_STATE.status === 'idle') return;
  const now = Date.now();
  if (!force && now - RUN_STATE.lastSnapshotAt < 5000) return;
  RUN_STATE.lastSnapshotAt = now;
  if (RUN_STATE.points.length > 2000) {
    RUN_STATE.points = RUN_STATE.points.filter((_, i) => i % 2 === 0);
  }
  try {
    localStorage.setItem(LIVE_RUN_KEY, JSON.stringify({
      v: 1,
      userId: currentProfile?.id,
      startedAt: RUN_STATE.startedAt,
      pausedAt: RUN_STATE.pausedAt,
      totalPausedMs: RUN_STATE.totalPausedMs,
      status: RUN_STATE.status,
      distanceMeters: RUN_STATE.distanceMeters,
      elapsedMs: _elapsedMs(),
      points: RUN_STATE.points,
      goalMiles: RUN_STATE.goalMiles,
      milestoneState: RUN_STATE.milestone ? RUN_STATE.milestone.state() : null,
      t: now
    }));
  } catch {}
}

let _recoveryChecked = false;
async function checkLiveRunRecovery() {
  if (_recoveryChecked || RUN_STATE.status !== 'idle') return;
  if (!window.Capacitor?.isNativePlatform()) return;
  if (typeof currentProfile === 'undefined' || !currentProfile) return; // auth not hydrated yet — later calls retry
  let snap;
  try { snap = JSON.parse(localStorage.getItem(LIVE_RUN_KEY) || 'null'); } catch { snap = null; }
  if (!snap || snap.v !== 1 || !snap.startedAt) { _recoveryChecked = true; return; }
  if (snap.userId && snap.userId !== currentProfile.id) { _recoveryChecked = true; return; }
  _recoveryChecked = true;

  const age = Date.now() - (snap.t || 0);
  const miles = (snap.distanceMeters || 0) / METERS_PER_MILE;

  // Too old to resume — quietly bank whatever was real, drop the rest.
  if (age > 12 * 3600 * 1000) {
    localStorage.removeItem(LIVE_RUN_KEY);
    if (miles >= 0.05 && (snap.elapsedMs || 0) >= 30000) {
      const seconds = Math.round(snap.elapsedMs / 1000);
      const payload = {
        p_started_at: new Date(snap.startedAt).toISOString(),
        p_ended_at: new Date(snap.t).toISOString(),
        p_duration_seconds: seconds,
        p_distance_miles: +miles.toFixed(2),
        p_pace_sec: miles > 0.01 ? Math.round(seconds / miles) : null,
        p_points: snap.points?.length ? snap.points : null,
        p_event_type: _runEventTypeFor(snap.startedAt, snap.t)
      };
      if (snap.goalMiles) { payload.p_goal_miles = snap.goalMiles; payload.p_goal_hit = miles >= snap.goalMiles; }
      try { localStorage.setItem(PENDING_RUN_KEY, JSON.stringify({ userId: currentProfile.id, payload })); } catch {}
      retryPendingRunSave();
    }
    return;
  }

  const resume = await confirmNative('You had a run going — pick up where you left off?', 'Resume Run', 'Discard');
  if (!resume) { localStorage.removeItem(LIVE_RUN_KEY); return; }

  RUN_STATE.status = snap.status === 'tracking' ? 'tracking' : snap.status;
  RUN_STATE.startedAt = snap.startedAt;
  RUN_STATE.pausedAt = snap.pausedAt || null;
  // Time the app spent dead doesn't count as running — credit anything beyond
  // a short crash-gap as paused so leaderboard paces stay honest.
  RUN_STATE.totalPausedMs = (snap.totalPausedMs || 0) + (RUN_STATE.status === 'tracking' ? Math.max(0, age - 120000) : 0);
  RUN_STATE.distanceMeters = snap.distanceMeters || 0;
  RUN_STATE.points = snap.points || [];
  RUN_STATE.lastPoint = null;
  RUN_STATE.goalMiles = snap.goalMiles || null;
  RUN_STATE.milestone = window.RunLogic ? RunLogic.createMilestoneEngine(RUN_STATE.goalMiles) : null;
  if (RUN_STATE.milestone && snap.milestoneState) RUN_STATE.milestone.restore(snap.milestoneState);
  RUN_STATE.autoPause = window.RunLogic ? RunLogic.createAutoPauseDetector() : null;
  RUN_STATE.timerInterval = setInterval(_updateTrackerUI, 1000);
  await _requestWakeLock();
  try { await _startWatchPosition(); } catch (err) {
    showToast('Could not restart GPS — check location permission.', 'error');
  }
  showRunTrackerUI();
  _updateTrackerUI();
  if (RUN_STATE.status !== 'tracking') {
    const pauseBtn = document.getElementById('rt-pause-btn');
    if (pauseBtn) pauseBtn.textContent = 'RESUME';
  }
  RunTrackerEvents.emit('onRunStart', { goalMiles: RUN_STATE.goalMiles });
  RunTrackerEvents.emit('onStatusChange', RUN_STATE.status);
  _snapshotLiveRun(true);
}

// ===== PREP SCREEN =====
// Show a pre-run screen with GPS warm-up + explicit START button.
// Nothing is tracked until the user confirms they're ready.
async function openRunTrackerPrep() {
  // GPS run tracking is an iPhone-app feature — the browser can't track a run
  // reliably with the screen off. Everything else in the app works on the web.
  if (!window.Capacitor?.isNativePlatform()) {
    showToast('Run tracking lives in the iPhone app — everything else works right here.', 'info');
    return;
  }
  if (RUN_STATE.status !== 'idle') {
    // Already tracking — just reopen the tracker
    showRunTrackerUI();
    _updateTrackerUI();
    return;
  }
  if (document.getElementById('run-tracker-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'run-tracker-overlay';
  overlay.className = 'run-tracker-overlay run-tracker-prep';
  overlay.innerHTML = `
    <button class="rt-close" onclick="closeRunTrackerUI()" aria-label="Close">×</button>
    <div class="rt-prep-title">READY TO RUN</div>
    <div class="rt-prep-gps">
      <div class="rt-gps-dot" id="rt-gps-dot"></div>
      <span id="rt-gps-text">Locking in GPS...</span>
    </div>
    <div class="rt-goal-label">GOAL</div>
    <div class="rt-goal-chips" id="rt-goal-chips">
      <button class="rt-goal-chip" data-goal="">JUST RUN</button>
      <button class="rt-goal-chip" data-goal="1">1 MI</button>
      <button class="rt-goal-chip" data-goal="2">2 MI</button>
      <button class="rt-goal-chip" data-goal="3">3 MI</button>
      <button class="rt-goal-chip" data-goal="5">5 MI</button>
      <button class="rt-goal-chip" data-goal="custom">CUSTOM</button>
    </div>
    <input type="number" inputmode="decimal" min="0.25" max="100" step="0.25"
      class="rt-goal-custom" id="rt-goal-custom" placeholder="Miles" hidden>
    <div class="rt-prep-hero">
      <div class="rt-metric-primary">
        <div class="rt-value">0.00</div>
        <div class="rt-label">Miles</div>
      </div>
    </div>
    <div class="rt-prep-tips">
      <div>· Lock your phone and pocket it — tracking keeps going</div>
      <div>· Auto-pause covers stoplights and water breaks</div>
      <div>· Pause anytime — stop when you're done</div>
    </div>
    <div class="rt-actions">
      <button class="btn-secondary" onclick="closeRunTrackerUI()">CANCEL</button>
      <button class="btn-primary rt-start-btn" id="rt-start-btn" onclick="beginRun()" disabled>START</button>
    </div>
  `;
  document.body.appendChild(overlay);
  _initGoalChips(overlay);

  // If warmer already has a fresh fix, show ready state instantly
  if (hasWarmGpsFix()) {
    const dot = document.getElementById('rt-gps-dot');
    const text = document.getElementById('rt-gps-text');
    const btn = document.getElementById('rt-start-btn');
    if (dot) dot.classList.add('ready');
    if (text) text.textContent = 'GPS locked · ready to go';
    if (btn) btn.disabled = false;
    return;
  }

  try {
    await _warmUpGPS();
    const dot = document.getElementById('rt-gps-dot');
    const text = document.getElementById('rt-gps-text');
    const btn = document.getElementById('rt-start-btn');
    const locked = hasWarmGpsFix();
    if (dot && locked) dot.classList.add('ready');
    if (text) text.textContent = locked
      ? 'GPS locked · ready to go'
      : 'Weak GPS signal — you can start, distance may lag';
    if (btn) btn.disabled = false;
  } catch (err) {
    const text = document.getElementById('rt-gps-text');
    const btn = document.getElementById('rt-start-btn');
    const denied = err?.message?.toLowerCase().includes('denied') || err?.code === 1;
    if (text) text.textContent = denied
      ? 'Location access needed — open Settings to enable'
      : 'Still searching for signal — you can start anyway';
    if (btn) btn.disabled = false; // allow start even without warm-up
  }
}

// Goal chips on the prep screen. Last-used goal is remembered and preselected.
function _initGoalChips(overlay) {
  const chips = overlay.querySelector('#rt-goal-chips');
  const customInput = overlay.querySelector('#rt-goal-custom');
  if (!chips || !customInput) return;

  const last = localStorage.getItem('riu_last_goal') || '';
  const preset = ['1', '2', '3', '5'];
  let activeValue = '';
  if (last && preset.includes(last)) activeValue = last;
  else if (last) activeValue = 'custom';

  function activate(chip, fromTap) {
    chips.querySelectorAll('.rt-goal-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const v = chip.dataset.goal;
    if (v === 'custom') {
      customInput.hidden = false;
      if (!customInput.value && last && !preset.includes(last)) customInput.value = last;
      setRunGoal(customInput.value);
      if (fromTap) customInput.focus();
    } else {
      customInput.hidden = true;
      setRunGoal(v);
    }
  }

  chips.querySelectorAll('.rt-goal-chip').forEach(chip => {
    chip.addEventListener('click', () => activate(chip, true));
  });
  customInput.addEventListener('input', () => setRunGoal(customInput.value));

  const initial = chips.querySelector(`.rt-goal-chip[data-goal="${activeValue}"]`) ||
                  chips.querySelector('.rt-goal-chip[data-goal=""]');
  activate(initial);
}

// Start a low-power watch that keeps GPS warm while the app is in the foreground.
// Call once on app entry; safe to call multiple times.
async function startGpsWarmer() {
  if (GPS_WARMER.enabled) return;
  GPS_WARMER.enabled = true;
  const nativeGeo = window.Capacitor?.Plugins?.Geolocation;
  const onFix = (coords, ts) => {
    if (!coords) return;
    GPS_WARMER.lastPosition = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
    GPS_WARMER.lastPositionAt = ts || Date.now();
    // Also pipe into an active run (autopaused included — _onPosition gates recording)
    if (RUN_STATE.status !== 'idle') {
      _onPosition(coords, ts);
    }
  };
  try {
    if (window.Capacitor?.isNativePlatform() && nativeGeo) {
      const perm = await nativeGeo.checkPermissions();
      GPS_WARMER.permission = perm?.location || 'unknown';
      if (GPS_WARMER.permission === 'prompt' || GPS_WARMER.permission === 'prompt-with-rationale') {
        const requested = await nativeGeo.requestPermissions({ permissions: ['location'] });
        GPS_WARMER.permission = requested?.location || GPS_WARMER.permission;
      }
      if (GPS_WARMER.permission === 'granted') {
        GPS_WARMER.watchId = await nativeGeo.watchPosition(
          { enableHighAccuracy: false, timeout: 15000 },
          (position, err) => {
            if (err) { console.warn('[gps-warmer]', err); return; }
            if (position?.coords) onFix(position.coords, position.timestamp);
          }
        );
      }
      return;
    }
    if (navigator.geolocation) {
      // On web the permission API is best-effort
      if (navigator.permissions?.query) {
        try { const s = await navigator.permissions.query({ name: 'geolocation' }); GPS_WARMER.permission = s.state; } catch {}
      }
      GPS_WARMER.watchId = navigator.geolocation.watchPosition(
        pos => onFix(pos.coords, pos.timestamp),
        err => console.warn('[gps-warmer web]', err),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
      );
    }
  } catch (err) {
    console.warn('[gps-warmer] start failed', err);
    GPS_WARMER.enabled = false;
  }
}

async function stopGpsWarmer() {
  if (!GPS_WARMER.enabled) return;
  const nativeGeo = window.Capacitor?.Plugins?.Geolocation;
  try {
    if (GPS_WARMER.watchId != null) {
      if (window.Capacitor?.isNativePlatform() && nativeGeo) {
        await nativeGeo.clearWatch({ id: GPS_WARMER.watchId });
      } else if (navigator.geolocation) {
        navigator.geolocation.clearWatch(GPS_WARMER.watchId);
      }
    }
  } catch {}
  GPS_WARMER.watchId = null;
  GPS_WARMER.enabled = false;
}

function hasWarmGpsFix() {
  return GPS_WARMER.lastPosition &&
    (Date.now() - GPS_WARMER.lastPositionAt < 60000) &&
    (GPS_WARMER.lastPosition.accuracy ?? 999) <= WARM_FIX_MAX_ACCURACY_M;
}

async function _warmUpGPS() {
  // Start the background warmer if not already running
  if (!GPS_WARMER.enabled) startGpsWarmer();
  // If we already have a recent fix, we're good
  if (hasWarmGpsFix()) return;

  const nativeGeo = window.Capacitor?.Plugins?.Geolocation;
  if (window.Capacitor?.isNativePlatform() && nativeGeo) {
    const perm = await nativeGeo.requestPermissions({ permissions: ['location'] });
    if (perm?.location === 'denied') throw new Error('Location permission denied');
    const pos = await nativeGeo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    if (pos?.coords) {
      GPS_WARMER.lastPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      GPS_WARMER.lastPositionAt = Date.now();
    }
    return;
  }
  if (!navigator.geolocation) throw new Error('Geolocation not available');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        GPS_WARMER.lastPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        GPS_WARMER.lastPositionAt = Date.now();
        resolve();
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// ===== BEGIN ACTUAL TRACKING =====
// "Three. Two. One. Let's go." — spoken when the voice coach is on, always
// shown. Tracking (and the clock) starts when the countdown ends.
async function _runCountdown() {
  const host = document.createElement('div');
  host.className = 'rt-countdown';
  host.id = 'rt-countdown';
  document.body.appendChild(host);
  const voice = window.VoiceCoach;
  const voiceOn = voice?.isOn?.() === true;
  const words = { '3': 'Three.', '2': 'Two.', '1': 'One.' };
  for (const digit of ['3', '2', '1']) {
    host.textContent = digit;
    host.classList.remove('pop');
    void host.offsetWidth;
    host.classList.add('pop');
    haptic('light');
    if (voiceOn) {
      await Promise.all([voice.say(words[digit]), new Promise(r => setTimeout(r, 700))]);
    } else {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  host.textContent = 'GO';
  host.classList.remove('pop');
  void host.offsetWidth;
  host.classList.add('pop');
  if (voiceOn) voice.say("Let's go."); // not awaited — start on the beat
  setTimeout(() => host.remove(), 700);
}

let _beginInFlight = false;
async function beginRun() {
  if (RUN_STATE.status !== 'idle' || _beginInFlight) return;
  _beginInFlight = true;
  try {
    const startBtn = document.getElementById('rt-start-btn');
    if (startBtn) startBtn.disabled = true;
    await _runCountdown();
    RUN_STATE.status = 'tracking';
    RUN_STATE.startedAt = Date.now();
    RUN_STATE.pausedAt = null;
    RUN_STATE.totalPausedMs = 0;
    RUN_STATE.distanceMeters = 0;
    RUN_STATE.lastPoint = null;
    RUN_STATE.points = [];
    RUN_STATE.milestone = window.RunLogic ? RunLogic.createMilestoneEngine(RUN_STATE.goalMiles) : null;
    RUN_STATE.autoPause = window.RunLogic ? RunLogic.createAutoPauseDetector() : null;
    RUN_STATE.timerInterval = setInterval(_updateTrackerUI, 1000);
    haptic('heavy');
    await _requestWakeLock();
    await _startWatchPosition();
    // Replace prep UI with live tracker UI
    closeRunTrackerUI();
    showRunTrackerUI();
    _updateTrackerUI();
    RunTrackerEvents.emit('onRunStart', { goalMiles: RUN_STATE.goalMiles });
    _snapshotLiveRun(true);
  } catch (err) {
    showToast(err.message || 'Could not start GPS — check location permission.', 'error');
    RUN_STATE.status = 'idle';
    clearInterval(RUN_STATE.timerInterval);
    RUN_STATE.timerInterval = null;
    await _releaseWakeLock();
    document.getElementById('rt-countdown')?.remove();
    closeRunTrackerUI();
  } finally {
    _beginInFlight = false;
  }
}

// Legacy alias — now shows the prep screen instead of auto-starting
async function startRun() {
  return openRunTrackerPrep();
}

function pauseRun() {
  if (RUN_STATE.status !== 'tracking' && RUN_STATE.status !== 'autopaused') return;
  const wasAuto = RUN_STATE.status === 'autopaused';
  RUN_STATE.status = 'paused'; // manual pause is sticky — never auto-resumes
  if (!wasAuto) RUN_STATE.pausedAt = Date.now(); // upgrading from auto keeps the original freeze point
  haptic('light');
  _updateTrackerUI();
  const pauseBtn = document.getElementById('rt-pause-btn');
  if (pauseBtn) pauseBtn.textContent = 'RESUME';
  if (!wasAuto) RunTrackerEvents.emit('onStatusChange', 'paused');
  _snapshotLiveRun(true);
}

function resumeRun() {
  if (RUN_STATE.status !== 'paused') return;
  RUN_STATE.totalPausedMs += Date.now() - RUN_STATE.pausedAt;
  RUN_STATE.pausedAt = null;
  RUN_STATE.status = 'tracking';
  RUN_STATE.lastPoint = null; // reset so we don't count teleport distance
  RUN_STATE.autoPause?.reset();
  haptic('light');
  const pauseBtn = document.getElementById('rt-pause-btn');
  if (pauseBtn) pauseBtn.textContent = 'PAUSE';
  RunTrackerEvents.emit('onStatusChange', 'tracking');
  _snapshotLiveRun(true);
}

// GPS says the runner stopped moving — freeze time/distance until they move.
function _autoPause() {
  if (RUN_STATE.status !== 'tracking') return;
  RUN_STATE.status = 'autopaused';
  RUN_STATE.pausedAt = Date.now();
  haptic('light');
  _updateTrackerUI();
  const pauseBtn = document.getElementById('rt-pause-btn');
  if (pauseBtn) pauseBtn.textContent = 'RESUME';
  RunTrackerEvents.emit('onStatusChange', 'autopaused');
  _snapshotLiveRun(true);
}

function _autoResume() {
  if (RUN_STATE.status !== 'autopaused') return;
  RUN_STATE.totalPausedMs += Date.now() - RUN_STATE.pausedAt;
  RUN_STATE.pausedAt = null;
  RUN_STATE.status = 'tracking';
  RUN_STATE.lastPoint = null;
  RUN_STATE.autoPause?.reset();
  haptic('light');
  const pauseBtn = document.getElementById('rt-pause-btn');
  if (pauseBtn) pauseBtn.textContent = 'PAUSE';
  RunTrackerEvents.emit('onStatusChange', 'tracking');
  _snapshotLiveRun(true);
}

const PENDING_RUN_KEY = 'riu_pending_run';
let _stopRunInFlight = false;

// Credit a club run only when the tracked run actually overlaps the club
// run's time window — computed in Chicago wall-clock time, never device tz.
// Anything else on a club day is a solo run (no check-in attached).
function _runEventTypeFor(startMs, endMs) {
  const dstr = chicagoDateStr(new Date(startMs));
  const dow = new Date(dstr + 'T12:00:00Z').getUTCDay();
  const runInfo = WEEKLY_RUNS.find(r => r.dayOfWeek === dow);
  if (!runInfo) return 'solo';
  const isEvening = (dow === 1 || dow === 2);
  const eventStart = chicagoWallClockToDate(dstr, isEvening ? 19 : 8, isEvening ? 0 : 30).getTime();
  const windowStart = eventStart - 30 * 60 * 1000;   // warming up early
  const windowEnd = eventStart + 3 * 60 * 60 * 1000; // long runs + stragglers
  return (startMs <= windowEnd && endMs >= windowStart) ? runInfo.eventType : 'solo';
}

// Save via RPC. If the check-in half hits the one-per-day unique index
// (23505 — user already checked in for that event), retry as a solo run so
// the run itself isn't lost. Returns null on success, the error otherwise.
async function _saveRunPayload(payload) {
  let { error } = await supabaseClient.rpc('save_run_with_checkin', payload);
  if (error && error.code === '23505' && payload.p_event_type !== 'solo') {
    payload.p_event_type = 'solo';
    ({ error } = await supabaseClient.rpc('save_run_with_checkin', payload));
  }
  return error || null;
}

// Retry a run that finished but couldn't reach the server (kept in
// localStorage until the save is confirmed).
let _retryPendingInFlight = false;
async function retryPendingRunSave() {
  if (_retryPendingInFlight) return;
  let stored;
  try { stored = JSON.parse(localStorage.getItem(PENDING_RUN_KEY) || 'null'); } catch { stored = null; }
  if (!stored || !stored.payload) return;
  if (typeof currentProfile === 'undefined' || !currentProfile) return;
  if (stored.userId && stored.userId !== currentProfile.id) return;
  _retryPendingInFlight = true;
  try {
    const error = await _saveRunPayload(stored.payload);
    if (!error) {
      localStorage.removeItem(PENDING_RUN_KEY);
      showToast('Your last run is saved — nice work.', 'success');
      try { if (typeof refreshHome === 'function') refreshHome(); } catch {}
      try { if (typeof refreshStats === 'function') refreshStats(); } catch {}
    } else if (error.code === '23505') {
      // Already saved server-side — drop the local copy so we don't loop
      localStorage.removeItem(PENDING_RUN_KEY);
    }
  } catch (err) {
    console.warn('[run-tracker] pending run retry failed', err);
  } finally {
    _retryPendingInFlight = false;
  }
}

async function stopRun() {
  if (RUN_STATE.status === 'idle' || _stopRunInFlight) return;
  _stopRunInFlight = true;
  try {
    const stats = _computeStats();
    const { miles, seconds, paceSecPerMile } = stats;

    // Discard if tiny run (use native-looking confirm modal)
    if (miles < 0.05 || seconds < 30) {
      const discard = await confirmNative('That was a short run — less than 0.05 mi / 30 seconds. Discard?', 'Discard Run', 'Keep Tracking');
      if (!discard) return;
      await _resetRun();
      closeRunTrackerUI();
      return;
    }

    clearInterval(RUN_STATE.timerInterval);
    RUN_STATE.timerInterval = null;
    await _stopWatchPosition();
    await _releaseWakeLock();

    const startedMs = RUN_STATE.startedAt;
    const startedAt = new Date(startedMs).toISOString();
    const endedAt = new Date().toISOString();
    const points = RUN_STATE.points;
    haptic('success');

    // Atomic save via RPC — runs + check_ins in one transaction
    const payload = {
      p_started_at: startedAt,
      p_ended_at: endedAt,
      p_duration_seconds: Math.round(seconds),
      p_distance_miles: +miles.toFixed(2),
      p_pace_sec: paceSecPerMile ? Math.round(paceSecPerMile) : null,
      p_points: points.length > 0 ? points : null,
      p_event_type: _runEventTypeFor(startedMs, Date.now())
    };
    if (RUN_STATE.goalMiles) {
      payload.p_goal_miles = RUN_STATE.goalMiles;
      payload.p_goal_hit = miles >= RUN_STATE.goalMiles;
    }
    let saved = false;
    try {
      // Keep a local copy until the save is confirmed — a failed save must
      // never destroy the finished run.
      try { localStorage.setItem(PENDING_RUN_KEY, JSON.stringify({ userId: currentProfile?.id, payload })); } catch {}
      const error = await _saveRunPayload(payload);
      if (error) throw error;
      saved = true;
      try { localStorage.removeItem(PENDING_RUN_KEY); } catch {}
    } catch (err) {
      console.error('[run-tracker] save failed', err);
      showToast("Run saved on this phone — couldn't reach the server yet. It'll sync automatically.", 'error');
    }

    // Refresh badges + home
    if (saved) {
      try { if (typeof checkAndAwardBadges === 'function') await checkAndAwardBadges(); } catch {}
      try { if (typeof refreshHome === 'function') refreshHome(); } catch {}
      try { if (typeof refreshStats === 'function') refreshStats(); } catch {}
    }

    RunTrackerEvents.emit('onStatusChange', 'finished', {
      miles, seconds, paceSecPerMile, goalMiles: RUN_STATE.goalMiles
    });
    showRunSummaryCard({ miles, seconds, paceSecPerMile, goalMiles: RUN_STATE.goalMiles });
    await _resetRun();
  } finally {
    _stopRunInFlight = false;
  }
}

async function _resetRun() {
  if (RUN_STATE.timerInterval) clearInterval(RUN_STATE.timerInterval);
  await _stopWatchPosition();
  await _releaseWakeLock();
  RUN_STATE.status = 'idle';
  RUN_STATE.startedAt = null;
  RUN_STATE.pausedAt = null;
  RUN_STATE.totalPausedMs = 0;
  RUN_STATE.distanceMeters = 0;
  RUN_STATE.lastPoint = null;
  RUN_STATE.points = [];
  RUN_STATE.timerInterval = null;
  RUN_STATE.goalMiles = null;
  RUN_STATE.milestone = null;
  RUN_STATE.autoPause = null;
  RUN_STATE.lastSnapshotAt = 0;
  try { localStorage.removeItem(LIVE_RUN_KEY); } catch {}
}

// ===== UI =====
function showRunTrackerUI() {
  let overlay = document.getElementById('run-tracker-overlay');
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'run-tracker-overlay';
  overlay.className = 'run-tracker-overlay';
  const RING_C = 565.49; // 2 * pi * r90 — keep in sync with the SVG below
  const goal = RUN_STATE.goalMiles;
  overlay.innerHTML = `
    <div class="rt-header">
      <div class="rt-live-dot"></div>
      <span class="rt-live-text">LIVE</span>
    </div>
    <div class="rt-autopaused-badge" id="rt-autopause-badge" hidden>AUTO-PAUSED</div>
    <div class="rt-metric rt-metric-primary">
      ${goal ? `
      <div class="rt-goal-ring-wrap">
        <svg class="rt-goal-ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="rt-ring-track" cx="100" cy="100" r="90"/>
          <circle class="rt-ring-fill" id="rt-ring-fill" cx="100" cy="100" r="90"
            stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
        </svg>
        <div class="rt-ring-inner">
          <div class="rt-value rt-value-ring" id="rt-distance">0.00</div>
          <div class="rt-label">Miles</div>
        </div>
      </div>
      <div class="rt-goal-sub">OF ${goal} MI GOAL</div>` : `
      <div class="rt-value" id="rt-distance">0.00</div>
      <div class="rt-label">Miles</div>`}
    </div>
    <div class="rt-metric-row">
      <div class="rt-metric">
        <div class="rt-value-sm" id="rt-time">0:00</div>
        <div class="rt-label">Time</div>
      </div>
      <div class="rt-metric">
        <div class="rt-value-sm" id="rt-pace">--'--"</div>
        <div class="rt-label">Pace</div>
      </div>
    </div>
    <div class="rt-actions">
      <button id="rt-pause-btn" class="btn-secondary" onclick="toggleRunPause()">PAUSE</button>
      <button class="btn-primary rt-stop-btn" onclick="stopRun()">STOP RUN</button>
    </div>
    <p class="rt-hint">Lock your phone and run — we've got you.</p>
  `;
  document.body.appendChild(overlay);
}

function closeRunTrackerUI() {
  document.getElementById('run-tracker-overlay')?.remove();
}

function toggleRunPause() {
  if (RUN_STATE.status === 'tracking') pauseRun();
  else if (RUN_STATE.status === 'paused') resumeRun();
  else if (RUN_STATE.status === 'autopaused') _autoResume(); // button reads RESUME — honor the tap
}

// ===== POST-RUN SUMMARY CARD =====
async function showRunSummaryCard({ miles, seconds, paceSecPerMile, goalMiles }) {
  closeRunTrackerUI();
  const goalHit = !!(goalMiles && miles >= goalMiles);
  const overlay = document.createElement('div');
  overlay.className = 'checkin-card-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const stats = await getUserStats(currentProfile.id);
  const paceLabel = PACE_GROUPS[currentProfile.pace_group]?.label || 'Runner';

  overlay.innerHTML = `
    <div class="checkin-card-modal">
      <div class="checkin-card" id="checkin-card-canvas">
        <div class="checkin-card-bg"></div>
        <div class="checkin-card-content">
          <img src="./assets/logo.png" class="checkin-card-logo" alt="RIU">
          <div class="checkin-card-locked">RUN LOGGED</div>
          ${goalHit ? `<div class="checkin-card-goalhit">GOAL HIT — ${goalMiles} MI</div>` : ''}
          <div class="checkin-card-day">${miles.toFixed(2)} MILES</div>
          <div class="checkin-card-location">${_formatDuration(seconds * 1000)} · ${_formatPace(paceSecPerMile)} pace</div>
          <div class="checkin-card-date">${new Date().toLocaleDateString('en-US',{ weekday:'short', month:'short', day:'numeric' })}</div>
          <div class="checkin-card-stats">
            <div class="checkin-card-stat">
              <div class="checkin-card-stat-value">${stats.streak}</div>
              <div class="checkin-card-stat-label">Week Streak</div>
            </div>
            <div class="checkin-card-stat">
              <div class="checkin-card-stat-value">${stats.totalCheckIns}</div>
              <div class="checkin-card-stat-label">Check-ins</div>
            </div>
            <div class="checkin-card-stat">
              <div class="checkin-card-stat-value">${stats.totalMiles.toFixed(1)}</div>
              <div class="checkin-card-stat-label">Total Miles</div>
            </div>
          </div>
          <div class="checkin-card-name">${escapeHtml(currentProfile.display_name)}</div>
          <div class="checkin-card-pace">${paceLabel}</div>
        </div>
      </div>
      <div class="checkin-card-actions">
        <button class="btn-primary" onclick="shareRunSummary(${miles.toFixed(2)}, ${Math.round(seconds)}, ${paceSecPerMile || 0}, ${goalHit ? goalMiles : 0})">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
          Share This Run
        </button>
        <button class="btn-secondary btn-sm" onclick="this.closest('.checkin-card-overlay').remove()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function shareRunSummary(miles, seconds, paceSecPerMile, goalMilesHit) {
  try {
    const [, logoImg, bgImg] = await Promise.all([
      loadBigShouldersFont(),
      loadImageSafe('./assets/logo.png'),
      loadImageSafe('./assets/photos/low-angle-urban.webp')
    ]);
    const displayFont = '"Big Shoulders Display", "Arial Black", Impact, sans-serif';
    const stats = await getUserStats(currentProfile.id);
    const paceLabel = PACE_GROUPS[currentProfile.pace_group]?.label || 'Runner';

    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, 0, 1080, 1920);
    if (bgImg) {
      ctx.globalAlpha = 0.28;
      const r = bgImg.width / bgImg.height, cr = 1080/1920;
      let w,h,x,y;
      if (r > cr) { h=1920; w=h*r; x=(1080-w)/2; y=0; } else { w=1080; h=w/r; x=0; y=(1920-h)/2; }
      ctx.drawImage(bgImg, x, y, w, h); ctx.globalAlpha = 1;
    }
    const grad = ctx.createLinearGradient(0, 0, 0, 1920);
    grad.addColorStop(0, 'rgba(10,10,10,0.5)');
    grad.addColorStop(0.45, 'rgba(10,10,10,0.85)');
    grad.addColorStop(1, 'rgba(10,10,10,0.95)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1920);
    if (logoImg) ctx.drawImage(logoImg, 470, 220, 140, 140);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#BFFF00';
    ctx.font = `900 120px ${displayFont}`;
    ctx.fillText('RUN LOGGED', 540, 500);

    if (goalMilesHit) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 44px ${displayFont}`;
      ctx.fillText(`GOAL HIT — ${goalMilesHit} MI`, 540, 566);
    }

    // Big miles hero
    ctx.fillStyle = '#BFFF00';
    ctx.font = `900 260px ${displayFont}`;
    ctx.fillText(miles.toFixed(2), 540, 780);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 56px ${displayFont}`;
    ctx.fillText('MILES', 540, 850);

    ctx.strokeStyle = '#BFFF00'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(340, 920); ctx.lineTo(740, 920); ctx.stroke();

    // Time + Pace
    const stY = 1050;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 80px ${displayFont}`;
    ctx.fillText(_formatDuration(seconds * 1000), 360, stY);
    ctx.fillText(_formatPace(paceSecPerMile), 720, stY);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 28px Inter, sans-serif';
    ctx.fillText('Time', 360, stY + 45);
    ctx.fillText('Pace', 720, stY + 45);

    // Name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 56px ${displayFont}`;
    ctx.fillText(currentProfile.display_name, 540, 1320, 960);
    ctx.fillStyle = '#BFFF00';
    ctx.font = '600 32px Inter, sans-serif';
    ctx.fillText(paceLabel, 540, 1375);

    // Stats row
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '500 28px Inter, sans-serif';
    ctx.fillText(`${stats.totalMiles.toFixed(1)} total miles · ${stats.streak}-week streak`, 540, 1470);

    ctx.fillStyle = '#BFFF00'; ctx.fillRect(440, 1680, 200, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `700 32px ${displayFont}`;
    ctx.fillText('RUN IT UP! DALLAS', 540, 1740);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '400 24px Inter, sans-serif';
    ctx.fillText('@runitupdallas', 540, 1790);

    canvas.toBlob(async (blob) => {
      if (!blob) { showToast('Could not generate image.', 'error'); return; }
      const file = new File([blob], 'runitup-run.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: 'Run It UP! Dallas',
            text: `${miles.toFixed(2)} miles · ${_formatDuration(seconds * 1000)} · ${_formatPace(paceSecPerMile)} pace. Run It UP! Dallas. #RunItUpDallas`,
            files: [file]
          });
        } catch (err) {
          if (err.name !== 'AbortError') downloadCheckInCard(canvas);
        }
      } else {
        const link = document.createElement('a');
        link.download = 'runitup-run.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Card saved — post it to your stories!', 'success');
      }
    }, 'image/png');
  } catch (err) {
    console.error('shareRunSummary', err);
    showToast('Could not share — try again.', 'error');
  }
}

// ===== RESILIENCE HOOKS =====
// The OS silently releases the screen wake lock whenever the page is hidden
// (app switch, notification, screen lock), and iOS stops delivering GPS while
// backgrounded. On return to foreground: re-acquire the wake lock, drop the
// stale GPS anchor so we don't add a straight teleport line across the gap,
// and retry any locally stored pending run save.
function _onAppForeground() {
  if (RUN_STATE.status !== 'idle') {
    _requestWakeLock();
    RUN_STATE.lastPoint = null; // re-anchor; avoids chord distance after a gap
    _snapshotLiveRun(true);
  }
  retryPendingRunSave();
  checkLiveRunRecovery();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _onAppForeground();
});
try {
  window.Capacitor?.Plugins?.App?.addListener?.('appStateChange', (state) => {
    if (state?.isActive) _onAppForeground();
  });
} catch {}
window.addEventListener('online', () => { retryPendingRunSave(); });
// One shot after launch, once auth has had a chance to hydrate.
setTimeout(() => { retryPendingRunSave(); checkLiveRunRecovery(); }, 8000);

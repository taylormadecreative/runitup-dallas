// ===== RUN DETAIL & HISTORY =====
// "My Runs" on the Stats tab + the Nike-style run detail overlay. Everything is
// computed on view from stored rows (RunMetrics); the save path is untouched.
// This screen displays — it must never affect tracking or saving.

const RunDetail = (() => {
  const PAGE = 50;
  const LIST_COLS = 'id, started_at, duration_seconds, distance_miles, avg_pace_sec_per_mile, goal_hit, source';
  const FULL_COLS = LIST_COLS + ', ended_at, goal_miles, avg_heart_rate, route_points';

  let history = { rows: [], done: false, loading: false };

  function _fmtPace(sec) {
    if (!isFinite(sec) || sec <= 0) return "--'--\"";
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}'${String(s).padStart(2, '0')}"`;
  }
  function _fmtDuration(totalSec) {
    const t = Math.floor(totalSec || 0);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
             : `${m}:${String(s).padStart(2,'0')}`;
  }
  function _fmtDate(iso, opts) {
    return new Date(iso).toLocaleDateString('en-US', opts);
  }

  // ---- My Runs (Stats tab) ----

  async function initHistory() {
    const host = document.getElementById('my-runs-section');
    // currentProfile/supabaseClient are top-level let/const in classic scripts
    // (auth.js, supabase.js) — never window properties — so this must use the
    // same typeof-guard pattern the rest of the codebase uses (e.g.
    // retryPendingRunSave in run-tracker.js), not a window.-prefixed check.
    // Guests get a real session + profile too (native runs are recordable as
    // a guest), so no extra guest gate here — the empty state covers no-runs-yet.
    if (!host || typeof currentProfile === 'undefined' || !currentProfile?.id || typeof supabaseClient === 'undefined') return;
    host.innerHTML = `
      <div class="mr-heading">MY RUNS</div>
      <div id="mr-list" class="mr-list"></div>
      <button id="mr-more" class="btn-secondary mr-more" hidden onclick="RunDetail.loadMore()">LOAD MORE</button>`;
    history = { rows: [], done: false, loading: false };
    await loadMore();
  }

  async function loadMore() {
    if (history.loading || history.done) return;
    history.loading = true;
    const list = document.getElementById('mr-list');
    try {
      const { data, error } = await supabaseClient.from('runs')
        .select(LIST_COLS)
        .eq('user_id', currentProfile.id)
        .order('started_at', { ascending: false })
        .range(history.rows.length, history.rows.length + PAGE - 1);
      if (error) throw error;
      history.rows = history.rows.concat(data || []);
      if (!data || data.length < PAGE) history.done = true;
      _renderHistory();
    } catch (err) {
      console.warn('[run-detail]', err);
      if (list && !history.rows.length) {
        list.innerHTML = `<div class="mr-empty">Couldn't load your runs.
          <button class="btn-secondary" onclick="RunDetail.initHistory()">RETRY</button></div>`;
      }
    } finally {
      history.loading = false;
    }
  }

  function _renderHistory() {
    const list = document.getElementById('mr-list');
    const more = document.getElementById('mr-more');
    if (!list) return;
    list.textContent = '';
    if (!history.rows.length) {
      const empty = document.createElement('div');
      empty.className = 'mr-empty';
      empty.textContent = 'No runs yet — hit START RUN and it lands here.';
      list.appendChild(empty);
      if (more) more.hidden = true;
      return;
    }
    for (const row of history.rows) {
      const btn = document.createElement('button');
      btn.className = 'mr-row';
      btn.onclick = () => open(row.id);
      const date = document.createElement('div');
      date.className = 'mr-date';
      date.textContent = _fmtDate(row.started_at, { weekday: 'short', month: 'short', day: 'numeric' });
      const miles = document.createElement('div');
      miles.className = 'mr-miles';
      miles.textContent = Number(row.distance_miles || 0).toFixed(2);
      const sub = document.createElement('div');
      sub.className = 'mr-sub';
      sub.textContent = `${_fmtPace(row.avg_pace_sec_per_mile)} · ${_fmtDuration(row.duration_seconds)}`;
      const badges = document.createElement('div');
      badges.className = 'mr-badges';
      if (row.goal_hit) badges.appendChild(Object.assign(document.createElement('span'), { className: 'mr-goal', textContent: 'GOAL' }));
      if (row.source === 'watch') badges.appendChild(Object.assign(document.createElement('span'), { className: 'mr-watch', textContent: '⌚' }));
      btn.append(date, miles, sub, badges);
      list.appendChild(btn);
    }
    if (more) more.hidden = history.done;
  }

  // ---- Detail overlay ----

  async function open(runIdOrRow, { justLogged = false, onFail } = {}) {
    if (document.getElementById('run-detail-overlay')) return;
    let run = (runIdOrRow && typeof runIdOrRow === 'object') ? runIdOrRow : null;
    if (!run) {
      try {
        const { data, error } = await supabaseClient.from('runs')
          .select(FULL_COLS).eq('id', runIdOrRow).single();
        if (error) throw error;
        run = data;
      } catch (err) {
        console.warn('[run-detail]', err);
        showToast("Couldn't open that run — try again.", 'error');
        // Caller (e.g. the just-saved-run swap) can pass onFail to show its own
        // fallback UI — otherwise a failed fetch here leaves the user with
        // nothing but the toast.
        onFail?.();
        return;
      }
    }
    // Weight lives in a self-only table (user_settings), not currentProfile — see
    // js/profile.js getMyWeightLbs() (cached, resolves to number|null).
    const weightLbs = await (window.getMyWeightLbs?.() ?? null);
    const metrics = RunMetrics.summarize(run, weightLbs);
    _renderOverlay(run, metrics, justLogged, weightLbs);
    _initMap(run, metrics);   // Task 5
    _loadWeather(run);        // Task 5
  }

  function _tile(id, value, label, extraClass = '') {
    return `<div class="rd-tile ${extraClass}" id="${id}">
      <div class="rd-tile-value">${value}</div>
      <div class="rd-tile-label">${label}</div>
    </div>`;
  }

  function _renderOverlay(run, metrics, justLogged, weightLbs) {
    const overlay = document.createElement('div');
    overlay.id = 'run-detail-overlay';
    overlay.className = 'run-detail-overlay';
    let cal;
    if (metrics.calories != null) {
      cal = `${metrics.calories}`;
    } else if (weightLbs != null) {
      cal = '—';
    } else if (window.Capacitor?.isNativePlatform()) {
      // Profile's run-settings (weight) section is iOS-only — only nudge there.
      cal = `<button class="rd-nudge" onclick="RunDetail.close(); navigateTo('profile')">Set weight<br>in Profile</button>`;
    } else {
      cal = '—';
    }
    const elev = metrics.elevationGainFt != null ? `${Math.round(metrics.elevationGainFt)} ft` : '—';
    const hr = run.avg_heart_rate ? `${run.avg_heart_rate}` : '—';
    const fastest = metrics.splits.length
      ? Math.min(...metrics.splits.filter(x => x.paceSecPerMile).map(x => x.paceSecPerMile))
      : null;
    const splitRows = metrics.splits.map(s => {
      const width = (s.paceSecPerMile && fastest) ? Math.max(20, Math.round(100 * fastest / s.paceSecPerMile)) : 0;
      return `<div class="rd-split">
        <div class="rd-split-mile">${s.miles === 1 ? s.mile : s.miles.toFixed(2)}</div>
        <div class="rd-split-bar-wrap"><div class="rd-split-bar" style="width:${width}%"></div>
          <span class="rd-split-pace">${_fmtPace(s.paceSecPerMile)}</span></div>
        <div class="rd-split-elev">${s.elevDeltaFt != null ? `${s.elevDeltaFt >= 0 ? '' : '-'}${Math.abs(Math.round(s.elevDeltaFt))} ft` : ''}</div>
      </div>`;
    }).join('');
    overlay.innerHTML = `
      ${justLogged ? '<div class="rd-logged">RUN LOGGED ✓</div>' : ''}
      <div class="rd-header">
        <button class="rd-close" onclick="RunDetail.close()" aria-label="Close">×</button>
        <div class="rd-when">${escapeHtml(_fmtDate(run.started_at, { weekday: 'long', month: 'long', day: 'numeric' }))}
          · ${escapeHtml(new Date(run.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</div>
      </div>
      <div class="rd-scroll">
        <div class="rd-big">
          <div class="rd-big-miles">${Number(run.distance_miles || 0).toFixed(2)}</div>
          <div class="rd-big-label">Miles</div>
        </div>
        <div class="rd-tiles">
          ${_tile('rd-pace', _fmtPace(run.avg_pace_sec_per_mile), 'Avg Pace')}
          ${_tile('rd-time', _fmtDuration(run.duration_seconds), 'Time')}
          ${_tile('rd-cal', cal, 'Calories')}
          ${_tile('rd-elev', elev, 'Elevation Gain')}
          ${_tile('rd-hr', hr, 'Avg Heart Rate')}
          ${_tile('rd-wx', '—', 'Weather')}
        </div>
        <div class="rd-map-wrap" id="rd-map-wrap">
          <div class="rd-map" id="rd-map"></div>
        </div>
        <div class="rd-splits-heading">SPLITS</div>
        <div class="rd-splits-cols"><span>Mile</span><span>Avg. Pace</span><span>Elev</span></div>
        <div class="rd-splits">${splitRows || '<div class="mr-empty">No split data.</div>'}</div>
        <button class="btn-primary rd-share" onclick="RunDetail.share()">Share This Run</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay._run = run; // for share()
    if (!Array.isArray(run.route_points) || run.route_points.length < 2) {
      const wrap = overlay.querySelector('#rd-map-wrap');
      if (wrap) wrap.innerHTML = '<div class="rd-no-route">No route recorded</div>';
    }
  }

  function share() {
    const run = document.getElementById('run-detail-overlay')?._run;
    if (!run || typeof shareRunSummary !== 'function') return;
    // shareRunSummary(miles, seconds, paceSecPerMile, goalMilesHit) — positional,
    // per its real definition in run-tracker.js. goalMilesHit is the goal-miles
    // number when the goal was hit, else falsy (matches its only existing call site).
    shareRunSummary(
      Number(run.distance_miles || 0),
      run.duration_seconds || 0,
      run.avg_pace_sec_per_mile,
      run.goal_hit ? run.goal_miles : 0
    );
  }

  function close() {
    _teardownMap(); // Task 5 (no-op stub here)
    document.getElementById('run-detail-overlay')?.remove();
  }

  // ---- Map + weather (implemented in the next task) ----
  function _initMap() {}
  function _teardownMap() {}
  function _loadWeather() {}

  return { initHistory, loadMore, open, close, share };
})();

window.RunDetail = RunDetail;

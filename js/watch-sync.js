// ===== APPLE WATCH SYNC =====
// The watch tracks; the phone saves. Runs arrive already carrying the watch's
// client id, so the server's idempotency makes redelivery harmless.

const WatchSync = (() => {
  let watchWorkoutActive = false;

  function isWatchWorkoutActive() { return watchWorkoutActive; }

  function buildPayload(run) {
    const startedMs = Date.parse(run.startedAt);
    const endedMs = Date.parse(run.endedAt);
    const miles = +Number(run.distanceMiles || 0).toFixed(2);
    const payload = {
      p_started_at: new Date(startedMs).toISOString(),
      p_ended_at: new Date(endedMs).toISOString(),
      p_duration_seconds: Math.round(run.durationSeconds || 0),
      p_distance_miles: miles,
      p_pace_sec: run.paceSecPerMile != null ? Math.round(run.paceSecPerMile) : null,
      p_points: Array.isArray(run.points) && run.points.length ? run.points : null,
      p_event_type: _runEventTypeFor(startedMs, endedMs),
      p_client_run_id: run.clientRunId,
      p_source: 'watch'
    };
    if (run.goalMiles) {
      payload.p_goal_miles = run.goalMiles;
      payload.p_goal_hit = run.goalHit === true;
    }
    if (run.avgHeartRate) payload.p_avg_heart_rate = Math.round(run.avgHeartRate);
    return payload;
  }

  // A run can legitimately arrive twice (queued transfer + application
  // context). The server dedupes on client id; this just avoids the round trip.
  const handled = new Set();

  async function onWatchRun(run) {
    if (!run || !run.clientRunId) return;
    if (handled.has(run.clientRunId)) return;
    handled.add(run.clientRunId);
    const miles = Number(run.distanceMiles || 0);
    if (miles < 0.05 || Number(run.durationSeconds || 0) < 30) return; // ignore accidental taps
    const payload = buildPayload(run);
    _addPendingRun(currentProfile?.id, payload); // queued first — never lose the run
    if (typeof currentProfile === 'undefined' || !currentProfile) return; // saves after next login
    try {
      const error = await _saveRunPayload(payload);
      if (error) throw error;
      _removePendingRun(payload);
      showToast('Apple Watch run saved — nice work.', 'success');
      try { if (typeof checkAndAwardBadges === 'function') await checkAndAwardBadges(); } catch {}
      try { if (typeof refreshHome === 'function') refreshHome(); } catch {}
      try { if (typeof refreshStats === 'function') refreshStats(); } catch {}
    } catch (err) {
      console.warn('[watch-sync] save failed, queued for retry', err);
    }
  }

  async function init() {
    const bridge = window.Capacitor?.Plugins?.WatchBridge;
    if (!window.Capacitor?.isNativePlatform() || !bridge) return;
    try {
      await bridge.addListener('watchRun', onWatchRun);
      await bridge.addListener('watchWorkoutState', (e) => {
        watchWorkoutActive = !!e?.active;
        try { if (typeof refreshHome === 'function') refreshHome(); } catch {}
      });
      await bridge.flush(); // drain anything that landed before we were listening
    } catch (err) {
      console.warn('[watch-sync] init failed', err);
    }
  }

  return { init, isWatchWorkoutActive, buildPayload };
})();

window.WatchSync = WatchSync;
setTimeout(() => { WatchSync.init(); }, 3000);

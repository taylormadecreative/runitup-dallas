// ===== RUN METRICS =====
// Pure derivations from a saved run row: per-mile splits, pace-colored map
// segments, elevation gain, calorie estimate. No DOM, no network — unit-tested
// in node (tests/run-metrics.test.js).
//
// route_points come from run-tracker/watch: {lat, lng, time(ms), alt?(m)},
// ~5 m apart, possibly decimated to ≤2000 (phone) / ≤400 (watch).

const RunMetrics = (() => {
  const METERS_PER_MILE = 1609.344;
  const FT_PER_M = 3.28084;
  // Clamp per-leg time so pauses can't poison a split. KNOWN LIMITATION: on a heavily
  // decimated watch track (~400 pts over a marathon at a slow ~16 min/mi pace), average
  // leg spacing runs ~105 m and ~63 s/leg — just over this clamp — so legitimate legs on
  // that combination (long run + slow pace + coarse watch decimation) get clamped too,
  // understating split time by roughly ~5%. Accepted tradeoff: still far better than a
  // real pause (minutes) leaking into a split uncapped.
  const MAX_LEG_DT_S = 60;
  const CLIMB_HYSTERESIS_M = 3;  // altitude must rise this much past the last low to count
  // Elevation smoothing window is distance-based, not point-count-based (route_points
  // density varies wildly: ~5 m/pt on a phone vs. much coarser on a decimated watch
  // track) — see ALT_SMOOTH_RADIUS_M/MIN/MAX_PTS below, used in computeElevationGainFt.
  const ALT_SMOOTH_RADIUS_M = 15; // include neighbors within this many track-meters
  const ALT_SMOOTH_MIN_PTS = 3;   // ...but always at least this many points (sparse tracks)
  const ALT_SMOOTH_MAX_PTS = 9;   // ...and never more than this many (very dense tracks)
  const CALS_PER_LB_MILE = 0.75; // standard gross running estimate
  const PACE_RAMP = ['#BFFF00', '#D7E600', '#EFC400', '#F79E00', '#FF7A00']; // fast -> slow

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

  // Legs with clamped time deltas — the shared walk for splits and segments.
  function _legs(points) {
    const legs = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const m = _haversineMeters(a, b);
      if (!(m > 0)) continue;
      const rawDt = (b.time - a.time) / 1000;
      legs.push({ a, b, m, dt: Math.min(Math.max(rawDt, 0), MAX_LEG_DT_S) });
    }
    return legs;
  }

  function computeSplits(points, totalSeconds, totalMiles) {
    if (!Array.isArray(points) || points.length < 2) {
      if (totalMiles > 0 && totalSeconds > 0) {
        return [{ mile: 1, miles: totalMiles, seconds: totalSeconds,
                  paceSecPerMile: totalSeconds / totalMiles, elevDeltaFt: null, crossing: null }];
      }
      return [];
    }
    const legs = _legs(points);
    const splits = [];
    let cumM = 0, cumT = 0, splitStartT = 0, boundary = METERS_PER_MILE;
    let splitStartAlt = typeof points[0].alt === 'number' ? points[0].alt : null;
    for (const leg of legs) {
      const legStartM = cumM, legStartT = cumT;
      cumM += leg.m;
      cumT += leg.dt;
      while (cumM >= boundary) {
        const frac = (boundary - legStartM) / leg.m;
        const crossT = legStartT + leg.dt * frac;
        const crossAlt = (typeof leg.a.alt === 'number' && typeof leg.b.alt === 'number')
          ? leg.a.alt + (leg.b.alt - leg.a.alt) * frac
          : (typeof leg.b.alt === 'number' ? leg.b.alt : null);
        splits.push({
          mile: splits.length + 1,
          miles: 1,
          seconds: crossT - splitStartT,
          paceSecPerMile: crossT - splitStartT,
          elevDeltaFt: (splitStartAlt != null && crossAlt != null)
            ? (crossAlt - splitStartAlt) * FT_PER_M : null,
          crossing: {
            lat: leg.a.lat + (leg.b.lat - leg.a.lat) * frac,
            lng: leg.a.lng + (leg.b.lng - leg.a.lng) * frac
          }
        });
        splitStartT = crossT;
        splitStartAlt = crossAlt;
        boundary += METERS_PER_MILE;
      }
    }
    // Trailing tail: route_points can be decimated (see header comment) and its raw
    // cumulative distance/time can undershoot the device-recorded totals near the very
    // end of the run. Prefer totalMiles/totalSeconds to close out the tail whenever they
    // report more distance than the points already accounted for; otherwise fall back to
    // the raw point-derived partial (e.g. GPS drift pushing slightly past the recorded total).
    const milesSoFar = splits.length;
    let tailMiles, tailSeconds;
    if (totalMiles > milesSoFar + 0.005) {
      tailMiles = totalMiles - milesSoFar;
      // The tail is the ROUTINE path (points almost always undershoot totalMiles a
      // little), so trusting totalSeconds - splitStartT unclamped lets a real pause
      // that landed in the tail (recorded in totalSeconds but not as inflated gaps
      // between route_points) leak into the tail split in full. Bound it: allow up to
      // 2x the run's own average pace for the tail's distance (generous slack for
      // ordinary decimation), never less than what the points themselves showed
      // (already pause-clamped via MAX_LEG_DT_S in _legs).
      const clampedTailFromPoints = cumT - splitStartT;
      const rawTail = Math.max(0, (totalSeconds || 0) - splitStartT);
      const avgPace = totalSeconds > 0 ? totalSeconds / totalMiles : null;
      const cappedTail = avgPace != null ? Math.min(rawTail, tailMiles * avgPace * 2) : clampedTailFromPoints;
      tailSeconds = Math.max(clampedTailFromPoints, cappedTail);
    } else {
      tailMiles = (cumM - (boundary - METERS_PER_MILE)) / METERS_PER_MILE;
      tailSeconds = cumT - splitStartT;
    }
    if (tailMiles > 0.005) {
      const last = points[points.length - 1];
      const lastAlt = typeof last.alt === 'number' ? last.alt : null;
      const finalElevDeltaFt = (splitStartAlt != null && lastAlt != null)
        ? (lastAlt - splitStartAlt) * FT_PER_M : null;
      if (tailMiles > 1.005) {
        // Heavy decimation left more than a mile unaccounted for at the tail. Keep the
        // per-mile shape UIs assume: synthesize full-mile splits at the tail's average
        // pace, then a final real partial (or a final whole mile, if the tail happens
        // to land on an exact mile count).
        const avgTailPace = tailSeconds / tailMiles;
        let wholeMiles = Math.floor(tailMiles + 1e-9);
        let remainderMiles = tailMiles - wholeMiles;
        if (remainderMiles < 0.005) { wholeMiles -= 1; remainderMiles += 1; }
        for (let k = 0; k < wholeMiles; k++) {
          splits.push({
            mile: splits.length + 1,
            miles: 1,
            seconds: avgTailPace,
            paceSecPerMile: avgTailPace,
            elevDeltaFt: null,
            crossing: null
          });
        }
        if (remainderMiles > 0.005) {
          splits.push({
            mile: splits.length + 1,
            miles: remainderMiles,
            seconds: avgTailPace * remainderMiles,
            paceSecPerMile: avgTailPace,
            elevDeltaFt: finalElevDeltaFt,
            crossing: null
          });
        }
      } else {
        splits.push({
          mile: splits.length + 1,
          miles: tailMiles,
          seconds: tailSeconds,
          paceSecPerMile: tailMiles > 0.01 ? tailSeconds / tailMiles : null,
          elevDeltaFt: finalElevDeltaFt,
          crossing: null
        });
      }
    }
    return splits;
  }

  function computePaceSegments(points) {
    if (!Array.isArray(points) || points.length < 2) return [];
    const legs = _legs(points);
    if (!legs.length) return [];
    // Smooth leg paces (sec/mile) with a small moving average so colors don't confetti.
    const paces = legs.map(l => (l.dt / (l.m / METERS_PER_MILE)));
    const smoothed = paces.map((_, i) => {
      const from = Math.max(0, i - 2), to = Math.min(paces.length - 1, i + 2);
      let sum = 0;
      for (let j = from; j <= to; j++) sum += paces[j];
      return sum / (to - from + 1);
    });
    // Normalize against this run's own p10..p90 so every run uses the full ramp.
    const sorted = [...smoothed].sort((x, y) => x - y);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    const range = Math.max(p90 - p10, 1);
    const bucket = (pace) => {
      const t = Math.min(1, Math.max(0, (pace - p10) / range));
      return PACE_RAMP[Math.min(PACE_RAMP.length - 1, Math.floor(t * PACE_RAMP.length))];
    };
    // Merge consecutive same-color legs into one polyline.
    const segments = [];
    for (let i = 0; i < legs.length; i++) {
      const color = bucket(smoothed[i]);
      const leg = legs[i];
      const lastSeg = segments[segments.length - 1];
      if (lastSeg && lastSeg.color === color) {
        lastSeg.latlngs.push([leg.b.lat, leg.b.lng]);
      } else {
        segments.push({ color, latlngs: [[leg.a.lat, leg.a.lng], [leg.b.lat, leg.b.lng]] });
      }
    }
    return segments;
  }

  function computeElevationGainFt(points) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const alts = points.map(p => (typeof p.alt === 'number' && isFinite(p.alt)) ? p.alt : null);
    const covered = alts.filter(a => a !== null).length;
    if (covered < points.length * 0.5 || covered < 2) return null;

    // Cumulative track distance per point (meters) — smoothing is defined in physical
    // space, not point count, because route_points density varies a lot (dense phone
    // GPS vs. coarse decimated watch tracks): a fixed point-count window either
    // over-smooths sparse tracks (eating real elevation signal) or under-smooths dense
    // ones (letting sensor jitter through as fake gain).
    const cumDist = [0];
    for (let i = 1; i < points.length; i++) {
      cumDist.push(cumDist[i - 1] + _haversineMeters(points[i - 1], points[i]));
    }
    const present = [];      // altitude values, in track order (nulls skipped)
    const presentDist = [];  // matching cumulative distance
    for (let i = 0; i < points.length; i++) {
      if (alts[i] !== null) { present.push(alts[i]); presentDist.push(cumDist[i]); }
    }
    // Derive one window size for the whole track from its median point spacing — a
    // window covering roughly a ±ALT_SMOOTH_RADIUS_M stretch of track (~7 pts at 5 m
    // spacing, ~3 pts at 100 m spacing), clamped to [MIN_PTS, MAX_PTS]. A single
    // track-wide window (applied via simple symmetric clipping at the ends, like any
    // moving average) avoids the worse edge distortion a per-point adaptive window
    // produces when it's forced to reach further into the interior to hit a minimum
    // count right at the start/end of a sparse track.
    const gaps = [];
    for (let i = 1; i < presentDist.length; i++) gaps.push(presentDist[i] - presentDist[i - 1]);
    gaps.sort((x, y) => x - y);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : ALT_SMOOTH_RADIUS_M;
    const windowPts = Math.max(ALT_SMOOTH_MIN_PTS, Math.min(ALT_SMOOTH_MAX_PTS,
      Math.round((2 * ALT_SMOOTH_RADIUS_M) / Math.max(medianGap, 0.001)) + 1));
    const half = Math.floor(windowPts / 2);
    const smoothed = present.map((_, i) => {
      const from = Math.max(0, i - half), to = Math.min(present.length - 1, i + half);
      let sum = 0;
      for (let j = from; j <= to; j++) sum += present[j];
      return sum / (to - from + 1);
    });
    // Hysteresis: only count climbs that rise CLIMB_HYSTERESIS_M past the running low,
    // and only stop counting a climb once it drops CLIMB_HYSTERESIS_M below its peak.
    let gainM = 0, counting = false, base = smoothed[0];
    for (const a of smoothed) {
      if (!counting) {
        if (a <= base) { base = a; }
        else if (a - base >= CLIMB_HYSTERESIS_M) { counting = true; gainM += a - base; base = a; }
      } else {
        if (a > base) { gainM += a - base; base = a; }
        else if (base - a >= CLIMB_HYSTERESIS_M) { counting = false; base = a; }
      }
    }
    return gainM * FT_PER_M;
  }

  function computeCalories(weightLbs, miles) {
    if (!(weightLbs > 0) || !(miles > 0)) return null;
    return Math.round(CALS_PER_LB_MILE * weightLbs * miles);
  }

  function summarize(run, weightLbs) {
    const points = Array.isArray(run?.route_points) ? run.route_points : null;
    return {
      splits: computeSplits(points, run?.duration_seconds || 0, run?.distance_miles || 0),
      segments: computePaceSegments(points),
      elevationGainFt: computeElevationGainFt(points),
      calories: computeCalories(weightLbs, run?.distance_miles || 0)
    };
  }

  return { computeSplits, computePaceSegments, computeElevationGainFt, computeCalories, summarize, PACE_RAMP };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = RunMetrics; }
if (typeof window !== 'undefined') { window.RunMetrics = RunMetrics; }

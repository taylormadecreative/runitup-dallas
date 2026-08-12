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
  const MAX_LEG_DT_S = 60;       // clamp per-leg time so pauses can't poison a split
  const CLIMB_HYSTERESIS_M = 3;  // altitude must rise this much past the last low to count
  const ALT_SMOOTH_WINDOW = 3;
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
      tailSeconds = Math.max(0, (totalSeconds || cumT) - splitStartT);
    } else {
      tailMiles = (cumM - (boundary - METERS_PER_MILE)) / METERS_PER_MILE;
      tailSeconds = cumT - splitStartT;
    }
    if (tailMiles > 0.005) {
      const last = points[points.length - 1];
      const lastAlt = typeof last.alt === 'number' ? last.alt : null;
      splits.push({
        mile: splits.length + 1,
        miles: tailMiles,
        seconds: tailSeconds,
        paceSecPerMile: tailMiles > 0.01 ? tailSeconds / tailMiles : null,
        elevDeltaFt: (splitStartAlt != null && lastAlt != null)
          ? (lastAlt - splitStartAlt) * FT_PER_M : null,
        crossing: null
      });
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
    // Moving-average smooth over present values (nulls skipped).
    const present = [];
    for (const a of alts) if (a !== null) present.push(a);
    const smoothed = present.map((_, i) => {
      const half = Math.floor(ALT_SMOOTH_WINDOW / 2);
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

# Run Detail & History (v1.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "My Runs" history list on the Stats tab and a Nike-style run detail screen (big distance, metric tiles, pace-colored Leaflet route map, per-mile splits, weather) that also replaces the dismiss-once post-run card — per `docs/superpowers/specs/2026-08-12-run-summary-design.md`.

**Architecture:** Compute-on-view. `js/run-metrics.js` (pure, node-tested) derives splits/segments/elevation/calories from stored run rows; `js/run-detail.js` renders history + overlay, lazy-loads vendored Leaflet, fetches weather from Open-Meteo. Only DB changes: `users.weight_lbs` + a select-own RLS policy on `runs`. Save RPC and watch payload untouched.

**Tech Stack:** Vanilla JS, Supabase (Management API for the prod migration), Leaflet 1.9.4 (vendored), Open-Meteo archive/forecast APIs, plain-node tests.

## Global Constraints

- **The detail screen displays; it never touches tracking or saving.** The ONE edit to the save flow is swapping which summary UI opens post-save, with the old card as fallback.
- All dynamic text rendered via DOM `textContent` or the `escapeHtml`/`escapeAttr` globals (js/supabase.js).
- CSS uses the tokens in `css/variables.css` (`--color-*`, `--space-*`, `--radius-*`, `--font-*`, `--safe-area-bottom`).
- No CDN at runtime for **code** — Leaflet is vendored into `assets/vendor/leaflet/`. Runtime **data** fetches (OSM tile images, Open-Meteo JSON) are allowed and expected.
- Missing metrics render "—"; the tile grid never reflows. No error toasts inside the detail screen.
- xcodebuild verification uses `-project App.xcodeproj` (repo is SPM; there is NO App.xcworkspace).
- `save_run_with_checkin` RPC (12 args) must NOT change. Watch target must NOT change.
- Icons: inline SVG `fill="currentColor"` (weather condition emoji from the existing `_wmoCode` map are the one sanctioned exception — they match the Home widget).
- Repo: /Users/nelsontaylor/Documents/runitup-app, branch `music-controls` (continue on it; it holds the approved spec and pending v1.5 work).
- Version bump / release is out of scope.

---

### Task 1: `run-metrics.js` — pure derivations

**Files:**
- Create: `js/run-metrics.js`
- Test: `tests/run-metrics.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `RunMetrics.summarize(run, weightLbs)` → `{ splits, segments, elevationGainFt, calories }` where `run = { route_points: [{lat,lng,time,alt?}]|null, duration_seconds, distance_miles }`. Also exported individually: `computeSplits(points, totalSeconds, totalMiles)` → `[{mile, miles, seconds, paceSecPerMile, elevDeltaFt|null, crossing:{lat,lng}|null}]`; `computePaceSegments(points)` → `[{latlngs:[[lat,lng],...], color}]`; `computeElevationGainFt(points)` → number|null; `computeCalories(weightLbs, miles)` → int|null. Dual export (`module.exports` + `window.RunMetrics`).

- [ ] **Step 1: Write the failing test**

Create `tests/run-metrics.test.js`:

```js
// Unit tests for js/run-metrics.js — run with: node tests/run-metrics.test.js
const RunMetrics = require('../js/run-metrics.js');

let failures = 0;
function ok(cond, label) {
  if (!cond) { failures++; console.error(`FAIL ${label}`); } else console.log(`ok ${label}`);
}
function approx(actual, expected, eps, label) {
  ok(typeof actual === 'number' && Math.abs(actual - expected) <= eps,
     `${label} (expected ~${expected}, got ${actual})`);
}

// Track builder: points heading due north, spaced evenly. 1 deg lat = 111194.93 m.
// milesTotal at secPerMile pace, one point every stepM meters.
function makeTrack(milesTotal, secPerMile, stepM = 100, withAlt = null) {
  const M_PER_MILE = 1609.344, M_PER_DEG = 111194.93;
  const totalM = milesTotal * M_PER_MILE;
  const pts = [];
  for (let m = 0, i = 0; m <= totalM + 0.01; m += stepM, i++) {
    const p = {
      lat: 32.7 + m / M_PER_DEG,
      lng: -96.8,
      time: 1700000000000 + (m / M_PER_MILE) * secPerMile * 1000
    };
    if (withAlt) p.alt = withAlt(m, i);
    pts.push(p);
  }
  return pts;
}

// ---------- splits: clean 2 mi at 10:00/mi ----------
{
  const s = RunMetrics.computeSplits(makeTrack(2, 600), 1200, 2);
  ok(s.length === 2, 'clean 2mi -> 2 splits');
  approx(s[0].seconds, 600, 5, 'split 1 ~600s');
  approx(s[1].seconds, 600, 5, 'split 2 ~600s');
  ok(s[0].mile === 1 && s[1].mile === 2, 'split mile numbers');
  ok(s[0].crossing && Math.abs(s[0].crossing.lng - -96.8) < 1e-6, 'crossing coord present');
}

// ---------- splits: trailing partial (2.5 mi) ----------
{
  const s = RunMetrics.computeSplits(makeTrack(2.5, 600), 1500, 2.5);
  ok(s.length === 3, '2.5mi -> 3 splits');
  approx(s[2].miles, 0.5, 0.02, 'partial split miles ~0.5');
  approx(s[2].paceSecPerMile, 600, 20, 'partial split pace ~600');
  ok(s[2].crossing === null, 'partial split has no crossing marker');
}

// ---------- splits: sub-mile run ----------
{
  const s = RunMetrics.computeSplits(makeTrack(0.5, 600), 300, 0.5);
  ok(s.length === 1, 'sub-mile -> 1 partial split');
  approx(s[0].miles, 0.5, 0.02, 'sub-mile miles');
}

// ---------- splits: pause gap is clamped, not poisoning ----------
{
  const pts = makeTrack(2, 600);
  const mid = Math.floor(pts.length / 4); // inside mile 1
  for (let i = mid; i < pts.length; i++) pts[i].time += 5 * 60 * 1000; // 5-min stand-still
  const s = RunMetrics.computeSplits(pts, 1500, 2);
  ok(s.length === 2, 'paused 2mi still 2 splits');
  ok(s[0].seconds < 700, `pause clamped (split1 ${Math.round(s[0].seconds)}s < 700)`);
}

// ---------- splits: no/degenerate points ----------
{
  const s = RunMetrics.computeSplits(null, 1200, 2);
  ok(s.length === 1 && s[0].miles === 2 && s[0].seconds === 1200, 'no points -> synthetic whole-run split');
  ok(RunMetrics.computeSplits([], 0, 0).length === 0, 'empty run -> no splits');
  ok(RunMetrics.computeSplits([{lat:32.7,lng:-96.8,time:1}], 600, 1).length === 1, 'single point -> synthetic split');
}

// ---------- elevation: steady 10 m climb ----------
{
  const pts = makeTrack(1, 600, 100, (m) => 100 + (m / 1609.344) * 10);
  approx(RunMetrics.computeElevationGainFt(pts), 32.8, 4, 'steady 10m climb ~32.8ft');
}

// ---------- elevation: ±1 m jitter stays ~0 ----------
{
  const pts = makeTrack(1, 600, 100, (m, i) => 100 + (i % 2 ? 1 : -1));
  const g = RunMetrics.computeElevationGainFt(pts);
  ok(g !== null && g < 5, `jitter gain suppressed (${g})`);
}

// ---------- elevation: missing alt ----------
ok(RunMetrics.computeElevationGainFt(makeTrack(1, 600)) === null, 'no alt -> null');
{
  const pts = makeTrack(1, 600, 100, null);
  pts[2].alt = 100; // <50% coverage
  ok(RunMetrics.computeElevationGainFt(pts) === null, 'sparse alt -> null');
}

// ---------- calories ----------
ok(RunMetrics.computeCalories(180, 2) === 270, 'calories 0.75*180*2');
ok(RunMetrics.computeCalories(null, 2) === null, 'no weight -> null');
ok(RunMetrics.computeCalories(180, 0) === null, 'no miles -> null');

// ---------- pace segments ----------
{
  // mile 1 at 8:00, mile 2 at 12:00 — first-mile segments must be greener (earlier ramp index)
  const fast = makeTrack(1, 480);
  const slowStartTime = fast[fast.length - 1].time;
  const slow = makeTrack(1, 720).map((p, i) => ({
    ...p, lat: p.lat + 1609.344 / 111194.93, time: slowStartTime + (p.time - 1700000000000)
  })).slice(1);
  const segs = RunMetrics.computePaceSegments(fast.concat(slow));
  ok(segs.length >= 2, 'segments produced');
  ok(segs.every(s => /^#[0-9A-F]{6}$/i.test(s.color) && Array.isArray(s.latlngs) && s.latlngs.length >= 2),
     'segment shape');
  const RAMP = RunMetrics.PACE_RAMP;
  ok(RAMP.indexOf(segs[0].color) < RAMP.indexOf(segs[segs.length - 1].color),
     'fast start greener than slow finish');
  ok(RunMetrics.computePaceSegments(null).length === 0, 'no points -> no segments');
}

// ---------- summarize ----------
{
  const run = { route_points: makeTrack(2, 600), duration_seconds: 1200, distance_miles: 2 };
  const out = RunMetrics.summarize(run, 180);
  ok(out.splits.length === 2 && out.segments.length > 0 && out.calories === 270
     && out.elevationGainFt === null, 'summarize composes');
}

process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/run-metrics.test.js`
Expected: FAIL — `Cannot find module '../js/run-metrics.js'`

- [ ] **Step 3: Write the implementation**

Create `js/run-metrics.js`:

```js
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
  const MAX_LEG_DT_S = 30;       // clamp per-leg time so pauses can't poison a split
  const CLIMB_HYSTERESIS_M = 3;  // altitude must rise this much past the last low to count
  const ALT_SMOOTH_WINDOW = 7;
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
    const partialM = cumM - (boundary - METERS_PER_MILE);
    const partialMiles = partialM / METERS_PER_MILE;
    if (partialMiles > 0.005) {
      const last = points[points.length - 1];
      const lastAlt = typeof last.alt === 'number' ? last.alt : null;
      splits.push({
        mile: splits.length + 1,
        miles: partialMiles,
        seconds: cumT - splitStartT,
        paceSecPerMile: partialMiles > 0.01 ? (cumT - splitStartT) / partialMiles : null,
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
    // Hysteresis: only count climbs that rise CLIMB_HYSTERESIS_M past the running low.
    let gainM = 0, low = smoothed[0], high = smoothed[0];
    for (const a of smoothed) {
      if (a < low) { low = a; high = a; }
      if (a > high) {
        if (a - low >= CLIMB_HYSTERESIS_M) {
          gainM += a - Math.max(high, low + (high === low ? 0 : 0));
          gainM = gainM; // accumulated below via delta
        }
        high = a;
      }
    }
    // Simpler, correct hysteresis pass (replaces the sketch above):
    gainM = 0; low = smoothed[0]; let counting = false; let base = smoothed[0];
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
```

**Note to implementer:** `computeElevationGainFt` contains a dead first-pass sketch immediately replaced by the labeled "simpler, correct hysteresis pass" — DELETE the sketch block (from `let gainM = 0, low = smoothed[0], high = smoothed[0];` through the first loop and its comment) and keep only the second pass, renaming as needed so the function reads cleanly. The tests define correctness.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/run-metrics.test.js` — all `ok`, exit 0. Also `node tests/run-logic.test.js` and `node tests/music-bar-logic.test.js` still pass.

- [ ] **Step 5: Commit**

```bash
git add js/run-metrics.js tests/run-metrics.test.js
git commit -m "feat: run metrics engine — splits, pace segments, elevation, calories"
```

---

### Task 2: Migration + prod apply + Leaflet vendoring

**Files:**
- Create: `supabase/migrations/20260812090000_users_weight_runs_select.sql`
- Create: `assets/vendor/leaflet/leaflet.js`, `assets/vendor/leaflet/leaflet.css` (downloaded, pinned 1.9.4)

**Interfaces:**
- Consumes: nothing.
- Produces: `public.users.weight_lbs numeric` column; RLS-safe client SELECT of own `runs` rows; `assets/vendor/leaflet/` usable via lazy `<script>`/`<link>` injection (Task 5).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260812090000_users_weight_runs_select.sql`:

```sql
-- v1.6 run detail & history: weight for calorie estimates + first-ever client read of runs.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS weight_lbs numeric;

-- The client has never SELECTed public.runs (saves go through the SECURITY DEFINER RPC).
-- Enable RLS (idempotent) and let owners read their own rows.
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'runs' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY runs_select_own ON public.runs
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
```

- [ ] **Step 2: Apply to prod via the Management API**

The CLI token lives in the macOS keychain, base64-wrapped; the API must be called with curl (python urllib is Cloudflare-blocked):

```bash
RAW=$(security find-generic-password -s "Supabase CLI" -w)
SB_TOKEN=$(echo "${RAW#go-keyring-base64:}" | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/rouvbfejsyfcmswlsezd/database/query" \
  -H "Authorization: Bearer $SB_TOKEN" -H "Content-Type: application/json" \
  --data-binary @<(python3 -c "import json,sys;print(json.dumps({'query':open('supabase/migrations/20260812090000_users_weight_runs_select.sql').read()}))")
```

Then verify:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/rouvbfejsyfcmswlsezd/database/query" \
  -H "Authorization: Bearer $SB_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name=''users'' AND column_name=''weight_lbs'') AS col, (SELECT count(*) FROM pg_policies WHERE tablename=''runs'' AND cmd=''SELECT'') AS pol, (SELECT relrowsecurity FROM pg_class WHERE relname=''runs'') AS rls"}'
```

Expected: `col: 1, pol: 1, rls: true`. Also confirm the save path still works after enabling RLS — the RPC is SECURITY DEFINER so it must: `SELECT count(*) FROM public.runs` via the same endpoint (service role) should still return the existing row count, and the browser E2E in Task 6 re-proves an end-to-end save.

- [ ] **Step 3: Vendor Leaflet 1.9.4**

```bash
mkdir -p assets/vendor/leaflet
curl -sL https://unpkg.com/leaflet@1.9.4/dist/leaflet.js -o assets/vendor/leaflet/leaflet.js
curl -sL https://unpkg.com/leaflet@1.9.4/dist/leaflet.css -o assets/vendor/leaflet/leaflet.css
head -c 200 assets/vendor/leaflet/leaflet.js && wc -c assets/vendor/leaflet/leaflet.js assets/vendor/leaflet/leaflet.css
```

Expected: leaflet.js ~147KB starting with the Leaflet 1.9.4 license banner; leaflet.css ~15KB. The `dist/images/` directory is deliberately NOT vendored — we use no default markers and no layers control, so nothing references those images (circleMarkers + divIcons only, per Task 5).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260812090000_users_weight_runs_select.sql assets/vendor/leaflet/
git commit -m "feat: weight_lbs column + runs select-own RLS (applied to prod) + vendored Leaflet 1.9.4"
```

---

### Task 3: Altitude capture + weight setting

**Files:**
- Modify: `ios/App/App/RunEnginePlugin.swift` (location payload)
- Modify: `js/run-tracker.js` (point shape + engine-fix mapping)
- Modify: `js/profile.js` (Weight settings row + save function)

**Interfaces:**
- Consumes: `users.weight_lbs` column (Task 2); `updateUserProfile(id, updates)` and `currentProfile` globals (existing).
- Produces: future route points carry `alt` (meters, 1 decimal) when vertical accuracy ≤ 20 m; `currentProfile.weight_lbs` maintained from Profile settings; global `saveWeightSetting(value)`.

- [ ] **Step 1: Forward altitude from the native engine**

In `ios/App/App/RunEnginePlugin.swift`, `locationManager(_:didUpdateLocations:)` (the `notifyListeners("location", ...)` dict), add two entries:

```swift
                "altitude": loc.altitude,
                "verticalAccuracy": loc.verticalAccuracy,
```

- [ ] **Step 2: Store alt on route points**

In `js/run-tracker.js`:

a) Find the engine-fix mapping in `_onEngineFix` (the function that adapts the RunEngine payload into the shared `coords`-shaped object, ~lines 179–207). Where it builds the coords object from `e.lat/e.lng/e.accuracy/...`, add:

```js
    altitude: typeof e.altitude === 'number' ? e.altitude : null,
    altitudeAccuracy: typeof e.verticalAccuracy === 'number' ? e.verticalAccuracy : null,
```

(matching the field names the browser's GeolocationCoordinates already uses, so the shared handler below covers web too).

b) Find the single point-creation site (`grep -n "const point = { lat: coords.latitude" js/run-tracker.js`, ~line 152):

```js
  const point = { lat: coords.latitude, lng: coords.longitude, time: timestamp || Date.now() };
```

Immediately after it, add:

```js
  // Altitude powers elevation gain on the run detail screen. Only keep fixes with
  // decent vertical accuracy — bad baro/GPS altitude invents hills.
  if (typeof coords.altitude === 'number' && isFinite(coords.altitude)
      && (coords.altitudeAccuracy == null || coords.altitudeAccuracy <= 20)) {
    point.alt = Math.round(coords.altitude * 10) / 10;
  }
```

- [ ] **Step 3: Weight field in Profile settings**

In `js/profile.js`, locate the Auto-Pause settings row (the `riu_auto_pause` checkbox, ~lines 90–95). Immediately after that row's closing tag, add a row **mirroring the exact wrapper/label classes of the adjacent rows** (copy their markup structure verbatim; only the control differs):

```html
      <!-- same wrapper/label classes as the row above -->
        Weight (lbs)
        <input type="number" inputmode="decimal" min="50" max="500" placeholder="—"
          value="${currentProfile?.weight_lbs ?? ''}"
          onchange="saveWeightSetting(this.value)">
```

And add the save function at file scope (near the other profile update handlers):

```js
// Weight (lbs) — synced to the account like pace_group; powers calorie estimates.
async function saveWeightSetting(value) {
  const n = parseFloat(value);
  const weight_lbs = (isFinite(n) && n >= 50 && n <= 500) ? n : null;
  try {
    currentProfile = await updateUserProfile(currentProfile.id, { weight_lbs });
    showToast(weight_lbs ? 'Weight saved' : 'Weight cleared', 'success');
  } catch (err) {
    console.warn('[profile] weight save failed', err);
    showToast("Couldn't save weight — try again.", 'error');
  }
}
```

- [ ] **Step 4: Verify**

```bash
node --check js/run-tracker.js && node --check js/profile.js
node tests/run-logic.test.js && node tests/run-metrics.test.js
cd ios/App && xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug build 2>&1 | tail -3; cd ../..
```

Expected: syntax clean, tests pass, `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add ios/App/App/RunEnginePlugin.swift js/run-tracker.js js/profile.js
git commit -m "feat: altitude capture on route points + weight setting in Profile"
```

---

### Task 4: `run-detail.js` — My Runs list + detail overlay (tiles + splits)

**Files:**
- Create: `js/run-detail.js`
- Create: `css/run-detail.css`
- Modify: `index.html` (stylesheet link + two script tags)
- Modify: `js/stats.js` (history section placeholder + init call)
- Modify: `js/run-tracker.js` (post-run swap, with fallback)

**Interfaces:**
- Consumes: `RunMetrics.summarize` (Task 1); `supabaseClient`, `currentProfile`, `escapeHtml`, `showToast`, `chicagoDateStr` globals; existing `shareRunSummary(args)` in run-tracker.js.
- Produces: `window.RunDetail` with `initHistory()`, `loadMore()`, `open(runIdOrRow, {justLogged})`, `close()`. Task 5 fills two stubs it ships here: `_initMap(run, metrics)` and `_loadWeather(run)` (both no-op in this task).

- [ ] **Step 1: Write `js/run-detail.js`**

```js
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
    if (!host || !window.currentProfile?.id || !window.supabaseClient) return;
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

  async function open(runIdOrRow, { justLogged = false } = {}) {
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
        return;
      }
    }
    const metrics = RunMetrics.summarize(run, currentProfile?.weight_lbs);
    _renderOverlay(run, metrics, justLogged);
    _initMap(run, metrics);   // Task 5
    _loadWeather(run);        // Task 5
  }

  function _tile(id, value, label, extraClass = '') {
    return `<div class="rd-tile ${extraClass}" id="${id}">
      <div class="rd-tile-value">${value}</div>
      <div class="rd-tile-label">${label}</div>
    </div>`;
  }

  function _renderOverlay(run, metrics, justLogged) {
    const overlay = document.createElement('div');
    overlay.id = 'run-detail-overlay';
    overlay.className = 'run-detail-overlay';
    const cal = metrics.calories != null
      ? `${metrics.calories}`
      : (currentProfile?.weight_lbs ? '—' : `<button class="rd-nudge" onclick="RunDetail.close(); navigateTo('profile')">Set weight<br>in Profile</button>`);
    const elev = metrics.elevationGainFt != null ? `${Math.round(metrics.elevationGainFt)} ft` : '—';
    const hr = run.avg_heart_rate ? `${run.avg_heart_rate}` : '—';
    const splitRows = metrics.splits.map(s => {
      const fastest = Math.min(...metrics.splits.filter(x => x.paceSecPerMile).map(x => x.paceSecPerMile));
      const width = s.paceSecPerMile ? Math.max(20, Math.round(100 * fastest / s.paceSecPerMile)) : 0;
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
    shareRunSummary({
      miles: Number(run.distance_miles || 0),
      seconds: run.duration_seconds || 0,
      paceSecPerMile: run.avg_pace_sec_per_mile,
      goalMiles: run.goal_miles
    });
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
```

**Implementer notes:** (a) Before writing `share()`, confirm `shareRunSummary`'s actual parameter shape at its definition (`grep -n "function shareRunSummary" js/run-tracker.js`, ~line 1076) and match it — if it takes different args, adapt the call, not the function. (b) The `fastest` computation inside the splits map is O(n²) as sketched — hoist it above the `.map()`.

- [ ] **Step 2: Write `css/run-detail.css`**

```css
/* ===== My Runs (Stats tab) ===== */
.my-runs-section { margin-top: var(--space-lg); }
.mr-heading { font-family: var(--font-display); font-size: 18px; letter-spacing: 0.08em; color: var(--color-text); margin-bottom: var(--space-sm); }
.mr-list { display: flex; flex-direction: column; }
.mr-row { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "date badges" "miles badges" "sub badges"; text-align: left; background: var(--color-surface); border: none; border-radius: var(--radius-md); padding: var(--space-md); margin-bottom: var(--space-sm); color: var(--color-text); }
.mr-row:active { opacity: 0.7; }
.mr-date { grid-area: date; font-size: 12px; color: var(--color-text-muted); }
.mr-miles { grid-area: miles; font-family: var(--font-display); font-size: 32px; line-height: 1.1; }
.mr-sub { grid-area: sub; font-size: 13px; color: var(--color-text-muted); }
.mr-badges { grid-area: badges; display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-xs); justify-content: center; }
.mr-goal { border: 1px solid var(--color-primary); color: var(--color-primary); border-radius: var(--radius-full); font-size: 10px; letter-spacing: 0.08em; padding: 2px 8px; }
.mr-watch { font-size: 14px; }
.mr-more { width: 100%; margin-top: var(--space-xs); }
.mr-empty { padding: var(--space-lg) 0; text-align: center; color: var(--color-text-muted); font-size: 14px; }

/* ===== Run detail overlay ===== */
.run-detail-overlay { position: fixed; inset: 0; z-index: 60; background: var(--color-bg); display: flex; flex-direction: column; }
.rd-logged { background: var(--color-primary); color: var(--color-bg); font-family: var(--font-display); letter-spacing: 0.1em; text-align: center; padding: 10px 0 calc(10px); font-size: 14px; }
.rd-header { display: flex; align-items: center; gap: var(--space-sm); padding: calc(var(--space-md) + env(safe-area-inset-top, 0px)) var(--space-md) var(--space-sm); }
.rd-close { background: none; border: none; color: var(--color-text); font-size: 28px; line-height: 1; padding: 0 var(--space-xs); }
.rd-when { font-size: 13px; color: var(--color-text-muted); }
.rd-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 var(--space-md) calc(var(--space-2xl) + var(--safe-area-bottom)); }
.rd-big-miles { font-family: var(--font-display); font-size: 88px; line-height: 1; color: var(--color-text); }
.rd-big-label { color: var(--color-text-muted); font-size: 14px; margin-bottom: var(--space-md); }
.rd-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-sm); margin-bottom: var(--space-md); }
.rd-tile { background: var(--color-surface); border-radius: var(--radius-md); padding: var(--space-sm) var(--space-sm); min-height: 64px; }
.rd-tile-value { font-family: var(--font-display); font-size: 22px; color: var(--color-text); }
.rd-tile-label { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
.rd-nudge { background: none; border: none; color: var(--color-primary); font-size: 12px; text-align: left; padding: 0; line-height: 1.3; }
.rd-map-wrap { border-radius: var(--radius-md); overflow: hidden; margin-bottom: var(--space-md); }
.rd-map { height: 280px; background: var(--color-surface); }
.rd-no-route { height: 80px; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); background: var(--color-surface); border-radius: var(--radius-md); font-size: 14px; }
.rd-splits-heading { font-family: var(--font-display); font-size: 18px; letter-spacing: 0.08em; margin-bottom: var(--space-xs); }
.rd-splits-cols { display: grid; grid-template-columns: 44px 1fr 56px; font-size: 11px; color: var(--color-text-muted); margin-bottom: var(--space-xs); }
.rd-split { display: grid; grid-template-columns: 44px 1fr 56px; align-items: center; margin-bottom: var(--space-xs); }
.rd-split-mile { font-size: 14px; }
.rd-split-bar-wrap { position: relative; background: var(--color-surface); border-radius: var(--radius-sm); height: 28px; }
.rd-split-bar { position: absolute; inset: 0 auto 0 0; background: var(--color-surface-hover); border-radius: var(--radius-sm); }
.rd-split-pace { position: absolute; left: var(--space-sm); top: 50%; transform: translateY(-50%); font-size: 13px; }
.rd-split-elev { text-align: right; font-size: 12px; color: var(--color-text-muted); }
.rd-share { width: 100%; margin-top: var(--space-md); }
```

- [ ] **Step 3: Wire index.html**

After the `css/stats.css` stylesheet link add `<link rel="stylesheet" href="css/run-detail.css">`; after the `js/music-bar.js` script tag add:

```html
  <script src="js/run-metrics.js" defer></script>
  <script src="js/run-detail.js" defer></script>
```

- [ ] **Step 4: Stats tab hook**

In `js/stats.js`, inside `renderStatsShell`'s template: immediately after the closing `</div>` of the `.stats-hero` block (the line before the `<!-- Challenge -->` comment), insert:

```html
    <div id="my-runs-section" class="my-runs-section"></div>
```

Then find where that template is injected (`grep -n "renderStatsShell(" js/stats.js` → the caller assigns it to an element's innerHTML). Immediately after that assignment, add:

```js
  window.RunDetail?.initHistory?.();
```

- [ ] **Step 5: Post-run swap**

In `js/run-tracker.js`, replace the line
`showRunSummaryCard({ miles, seconds, paceSecPerMile, goalMiles: RUN_STATE.goalMiles });` (~line 934) with:

```js
    // Rich run detail when the save returned a row id; the classic card remains
    // the fallback (offline queue, web, or run-detail unavailable).
    if (saved?.run_id && window.RunDetail?.open) {
      RunDetail.open(saved.run_id, { justLogged: true });
    } else {
      showRunSummaryCard({ miles, seconds, paceSecPerMile, goalMiles: RUN_STATE.goalMiles });
    }
```

(Verify the RPC-result variable really is `saved` holding `{run_id, check_in_id}` at that point — it is per the current code at ~line 925.)

- [ ] **Step 6: Verify**

```bash
node --check js/run-detail.js && node tests/run-metrics.test.js && node tests/run-logic.test.js && npm run build
```

Then serve `www/` and in the browser (Playwright): sign in as Nelson's account on the web build, Stats tab → MY RUNS renders rows from real DB rows; tap one → overlay opens with big miles, tiles (weather "—", map area present or "No route recorded"), splits rows; close works; zero new console errors.

- [ ] **Step 7: Commit**

```bash
git add js/run-detail.js css/run-detail.css index.html js/stats.js js/run-tracker.js
git commit -m "feat: My Runs history + run detail overlay (tiles, splits, post-run swap)"
```

---

### Task 5: Leaflet map + pace polyline + weather tile

**Files:**
- Modify: `js/run-detail.js` (replace the three stubs; add lazy loader)
- Modify: `css/run-detail.css` (mile-marker + attribution styles)

**Interfaces:**
- Consumes: `assets/vendor/leaflet/` (Task 2); `RunMetrics` segments/splits crossings (Task 1); `_wmoCode(code)` global from js/home.js (guard with `typeof`); `chicagoDateStr(date)` global from js/supabase.js.
- Produces: working `_initMap(run, metrics)`, `_teardownMap()`, `_loadWeather(run)`.

- [ ] **Step 1: Replace the stubs in `js/run-detail.js`**

```js
  // ---- Leaflet (vendored, lazy) ----
  let _leafletPromise = null;
  let _map = null;

  function _loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'assets/vendor/leaflet/leaflet.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'assets/vendor/leaflet/leaflet.js';
      script.onload = resolve;
      script.onerror = () => { _leafletPromise = null; reject(new Error('leaflet load failed')); };
      document.head.appendChild(script);
    });
    return _leafletPromise;
  }

  async function _initMap(run, metrics) {
    const el = document.getElementById('rd-map');
    if (!el || !Array.isArray(run.route_points) || run.route_points.length < 2) return;
    try {
      await _loadLeaflet();
      if (!document.getElementById('rd-map')) return; // overlay closed while loading
      _map = L.map(el, { zoomControl: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(_map);
      const bounds = [];
      for (const seg of metrics.segments) {
        L.polyline(seg.latlngs, { color: seg.color, weight: 5, opacity: 0.95, lineCap: 'round' }).addTo(_map);
        for (const ll of seg.latlngs) bounds.push(ll);
      }
      const first = run.route_points[0];
      const last = run.route_points[run.route_points.length - 1];
      L.circleMarker([first.lat, first.lng], { radius: 7, color: '#0A0A0A', weight: 2, fillColor: '#BFFF00', fillOpacity: 1 }).addTo(_map);
      L.circleMarker([last.lat, last.lng], { radius: 7, color: '#0A0A0A', weight: 2, fillColor: '#FF3B30', fillOpacity: 1 }).addTo(_map);
      for (const s of metrics.splits) {
        if (!s.crossing) continue;
        L.marker([s.crossing.lat, s.crossing.lng], {
          icon: L.divIcon({ className: 'rd-mile-marker', html: `${s.mile} mi`, iconSize: [40, 18], iconAnchor: [20, 9] }),
          interactive: false
        }).addTo(_map);
      }
      _map.fitBounds(bounds.length ? bounds : [[first.lat, first.lng]], { padding: [24, 24] });
    } catch (err) {
      console.warn('[run-detail] map', err); // route without streets beats nothing; tiles may still land later
    }
  }

  function _teardownMap() {
    try { _map?.remove(); } catch {}
    _map = null;
  }

  // ---- Weather (Open-Meteo, cached per run) ----
  const WX_CACHE_KEY = 'riu_run_wx';
  const WX_CACHE_MAX = 100;

  function _wxCache() {
    try { return JSON.parse(localStorage.getItem(WX_CACHE_KEY)) || {}; } catch { return {}; }
  }

  async function _loadWeather(run) {
    const tile = () => document.getElementById('rd-wx')?.querySelector('.rd-tile-value');
    const label = () => document.getElementById('rd-wx')?.querySelector('.rd-tile-label');
    const p0 = Array.isArray(run.route_points) ? run.route_points[0] : null;
    if (!p0) return;
    const cache = _wxCache();
    const cached = cache[run.id];
    const paint = (wx) => {
      const v = tile(), l = label();
      if (v) v.textContent = `${wx.icon} ${wx.temp}°`;
      if (l) l.textContent = wx.summary || 'Weather';
    };
    if (cached) { paint(cached); return; }
    try {
      const started = new Date(run.started_at);
      const dateStr = typeof chicagoDateStr === 'function'
        ? chicagoDateStr(started)
        : started.toISOString().slice(0, 10);
      const ageDays = (Date.now() - started.getTime()) / 86400000;
      const base = ageDays > 6
        ? `https://archive-api.open-meteo.com/v1/archive?start_date=${dateStr}&end_date=${dateStr}`
        : `https://api.open-meteo.com/v1/forecast?past_days=7&forecast_days=1`;
      const url = `${base}&latitude=${p0.lat.toFixed(4)}&longitude=${p0.lng.toFixed(4)}` +
        `&hourly=temperature_2m,weathercode&temperature_unit=fahrenheit&timezone=America%2FChicago`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`weather ${res.status}`);
      const data = await res.json();
      const times = data?.hourly?.time || [];
      let best = -1, bestDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(new Date(times[i]).getTime() - started.getTime());
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      }
      if (best < 0) return;
      const code = data.hourly.weathercode?.[best];
      const meta = (typeof _wmoCode === 'function') ? _wmoCode(code) : { icon: '🌡️', summary: 'Weather' };
      const wx = { temp: Math.round(data.hourly.temperature_2m?.[best]), icon: meta.icon, summary: meta.summary };
      if (!isFinite(wx.temp)) return;
      paint(wx);
      const keys = Object.keys(cache);
      if (keys.length >= WX_CACHE_MAX) delete cache[keys[0]];
      cache[run.id] = wx;
      try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify(cache)); } catch {}
    } catch (err) {
      console.warn('[run-detail] weather', err); // tile stays "—", retries next open
    }
  }
```

- [ ] **Step 2: Append marker styles to `css/run-detail.css`**

```css
.rd-mile-marker { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-primary); border-radius: var(--radius-full); font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.rd-map .leaflet-control-attribution { background: rgba(10, 10, 10, 0.7); color: var(--color-text-muted); font-size: 9px; }
.rd-map .leaflet-control-attribution a { color: var(--color-text-muted); }
```

- [ ] **Step 3: Verify in the browser**

```bash
node --check js/run-detail.js && node tests/run-metrics.test.js && npm run build
```

Playwright on the served web build, signed in: open a run with a stored route → street tiles render, pace-colored line with green start / red end dots and "1 mi" markers, map fits the route; weather tile fills within a few seconds and is instant (cached) on reopen; a run with no route shows "No route recorded" and no map errors; close → reopen works (map teardown clean). Zero new console errors (OSM tile 429s, if any, are logged-only).

- [ ] **Step 4: Commit**

```bash
git add js/run-detail.js css/run-detail.css
git commit -m "feat: run detail map — pace-colored Leaflet route + mile markers + weather tile"
```

---

### Task 6: End-to-end verification

**Files:** none created (fixes only if verification fails).

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full browser pass (web build, Playwright, real account)**

1. Stats tab: MY RUNS lists existing runs newest-first; LOAD MORE appears only with >50 runs.
2. Detail from history: tiles, map, splits, share button (canvas share sheet appears / logs on web), close.
3. Calories nudge path: with `weight_lbs` null → "Set weight in Profile" → tap → lands on Profile; set weight 180 → reopen run → calories number renders.
4. Error paths: kill network (Playwright route abort on open-meteo) → weather "—", no toast; abort OSM tiles → polyline still draws.
5. Existing suites: `node tests/run-metrics.test.js && node tests/run-logic.test.js && node tests/music-bar-logic.test.js` all pass.
6. Run-save regression: on the web build, complete a short simulated run (web fallback tracker) or verify via the existing E2E flow that a save still succeeds post-RLS-enable and the post-run screen opens the detail overlay (or falls back to the classic card when the save is queued offline).

- [ ] **Step 2: Device piggyback note (not blocking this plan)**

Elevation capture (altitude on new points) is verified on Nelson's next real device run — same session as the music-controls Task 6 checklist: after a run, open it in My Runs and confirm the Elevation Gain tile shows a number, not "—".

- [ ] **Step 3: Commit any verification fixes**

```bash
git add -A && git commit -m "fix: run detail verification findings"
```

---

## Self-review notes (completed)

- **Spec coverage:** My Runs list (T4), detail overlay + tiles + splits (T4), pace-colored street map + mile markers (T5), weather archive/forecast + cache (T5), post-run swap with fallback (T4), weight field + calories nudge (T3/T4), altitude capture (T3), migration + RLS + prod apply (T2), Leaflet vendored (T2), pure metrics + unit suite (T1), error states (T4/T5/T6), run-save regression (T6), device piggyback (T6). Spec's "web/desktop works" covered by T4/T6 browser verification.
- **Placeholder scan:** clean — every step carries code or exact commands. Two intentional implementer-judgment notes (mirroring profile row markup; confirming shareRunSummary's signature) name the exact grep to run.
- **Type consistency:** `run` row columns match the scout-verified schema; `splits[].crossing` produced in T1 and consumed in T5; `_initMap/_teardownMap/_loadWeather` stub names in T4 match T5's replacements; `PACE_RAMP` exported in T1 and asserted in its tests.

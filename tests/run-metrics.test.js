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

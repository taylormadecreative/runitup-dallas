// Unit tests for js/run-logic.js — run with: node tests/run-logic.test.js
const RunLogic = require('../js/run-logic.js');

let failures = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}\n  expected: ${e}\n  actual:   ${a}`); }
  else console.log(`ok ${label}`);
}
function ok(cond, label) {
  if (!cond) { failures++; console.error(`FAIL ${label}`); }
  else console.log(`ok ${label}`);
}

// ---------- phraseDuration ----------
eq(RunLogic.phraseDuration(1180000), 'nineteen minutes, forty seconds', 'phraseDuration 19:40');
eq(RunLogic.phraseDuration(65000), 'one minute, five seconds', 'phraseDuration 1:05');
eq(RunLogic.phraseDuration(40000), 'forty seconds', 'phraseDuration 0:40');
eq(RunLogic.phraseDuration(1200000), 'twenty minutes', 'phraseDuration exact 20:00');
eq(RunLogic.phraseDuration(3725000), 'one hour, two minutes, five seconds', 'phraseDuration 1:02:05');

// ---------- phrasePace ----------
eq(RunLogic.phrasePace(590), 'nine fifty', 'phrasePace 9\'50');
eq(RunLogic.phrasePace(545), 'nine oh five', 'phrasePace 9\'05');
eq(RunLogic.phrasePace(600), 'ten flat', 'phrasePace 10\'00');
eq(RunLogic.phrasePace(null), null, 'phrasePace null');
eq(RunLogic.phrasePace(Infinity), null, 'phrasePace Infinity');
eq(RunLogic.phrasePace(0), null, 'phrasePace 0');

// ---------- phraseMiles ----------
eq(RunLogic.phraseMiles(2), 'two miles', 'phraseMiles 2');
eq(RunLogic.phraseMiles(1), 'one mile', 'phraseMiles 1');
eq(RunLogic.phraseMiles(0.5), 'half a mile', 'phraseMiles 0.5');
eq(RunLogic.phraseMiles(0.25), 'a quarter mile', 'phraseMiles 0.25');
eq(RunLogic.phraseMiles(2.5), '2.5 miles', 'phraseMiles 2.5');
eq(RunLogic.phraseMiles(3.1), '3.1 miles', 'phraseMiles 3.1');

// ---------- milestone engine: clean 2-mi goal run ----------
{
  const m = RunLogic.createMilestoneEngine(2);
  eq(m.onSample({ miles: 0.4, elapsedMs: 240000 }), [], '2mi: nothing at 0.4');
  // Crossing 1.00 mi: mile split AND halfway in one batch
  const at1 = m.onSample({ miles: 1.01, elapsedMs: 600000 });
  eq(at1.length, 2, '2mi: two utterances at 1.01');
  ok(at1[0].startsWith('Mile one.'), '2mi: mile-1 split first');
  ok(at1[0].includes('Total time ten minutes.'), '2mi: split includes total time');
  ok(at1[0].includes('Average pace nine fifty'), '2mi: split includes avg pace (9\'54 -> nine fifty-four? see impl note)') ;
  eq(at1[1], 'Halfway there. One mile to go.', '2mi: halfway phrase');
  eq(m.onSample({ miles: 1.2, elapsedMs: 700000 }), [], '2mi: quiet mid-run');
  eq(m.onSample({ miles: 1.76, elapsedMs: 1000000 }), ['Quarter mile to go. Finish strong.'], '2mi: final stretch at 1.76');
  const at2 = m.onSample({ miles: 2.01, elapsedMs: 1180000 });
  eq(at2.length, 2, '2mi: mile-2 + goal at 2.01');
  ok(at2[0].startsWith('Mile two.'), '2mi: mile-2 split before goal');
  eq(at2[1], 'Goal hit. Two miles. Way to run it up.', '2mi: goal phrase');
  eq(m.onSample({ miles: 2.3, elapsedMs: 1400000 }), [], '2mi: silent after goal');
}

// ---------- milestone engine: no goal -> splits only ----------
{
  const m = RunLogic.createMilestoneEngine(null);
  const r = m.onSample({ miles: 1.02, elapsedMs: 612000 });
  eq(r.length, 1, 'no-goal: one utterance at mile 1');
  ok(r[0].startsWith('Mile one.'), 'no-goal: split only');
  eq(m.onSample({ miles: 1.9, elapsedMs: 1100000 }), [], 'no-goal: quiet at 1.9');
}

// ---------- milestone engine: GPS jump ----------
{
  const m = RunLogic.createMilestoneEngine(null);
  const r = m.onSample({ miles: 2.1, elapsedMs: 1200000 });
  eq(r.length, 1, 'jump: single utterance');
  ok(r[0].startsWith('Mile two.'), 'jump: only latest mile announced');
}

// ---------- milestone engine: jump across halfway+final straight to goal ----------
{
  const m = RunLogic.createMilestoneEngine(2);
  m.onSample({ miles: 0.9, elapsedMs: 540000 });
  const r = m.onSample({ miles: 2.1, elapsedMs: 1260000 });
  // goal fired in same batch -> halfway/final suppressed; mile split + goal only
  eq(r.length, 2, 'goal-jump: two utterances');
  ok(r[0].startsWith('Mile two.'), 'goal-jump: mile split');
  ok(r[1].startsWith('Goal hit.'), 'goal-jump: goal, no halfway/final chatter');
}

// ---------- milestone engine: state()/restore() round-trip ----------
{
  const m = RunLogic.createMilestoneEngine(2);
  m.onSample({ miles: 1.05, elapsedMs: 630000 });
  const snap = m.state();
  const m2 = RunLogic.createMilestoneEngine(2);
  m2.restore(snap);
  eq(m2.onSample({ miles: 1.1, elapsedMs: 660000 }), [], 'restore: mile 1 + halfway not re-announced');
  const r = m2.onSample({ miles: 1.76, elapsedMs: 1000000 });
  eq(r, ['Quarter mile to go. Finish strong.'], 'restore: final stretch still fires');
}

// ---------- small-goal rule: final stretch only when goal >= 0.75 ----------
{
  const m = RunLogic.createMilestoneEngine(0.5);
  const r = m.onSample({ miles: 0.26, elapsedMs: 150000 });
  eq(r, ['Halfway there. A quarter mile to go.'], 'small goal: halfway with quarter-mile remaining');
  const r2 = m.onSample({ miles: 0.5, elapsedMs: 300000 });
  eq(r2, ['Goal hit. Half a mile. Way to run it up.'], 'small goal: goal, never a final-stretch call');
}

// ---------- auto-pause detector ----------
{
  const d = RunLogic.createAutoPauseDetector();
  // establish clock at t=0 with a moving fix (also covers 15s immunity start)
  eq(d.onFix({ speedMps: 3.0, accuracyM: 5, tMs: 0, status: 'tracking' }), null, 'ap: moving fix');
  // immunity: dead stop inside first 15 s never pauses
  for (let t = 1000; t <= 14000; t += 1000) {
    ok(d.onFix({ speedMps: 0.1, accuracyM: 5, tMs: t, status: 'tracking' }) === null, `ap: immune at ${t}`);
  }
  // moving again resets stillness
  eq(d.onFix({ speedMps: 3.0, accuracyM: 5, tMs: 19000, status: 'tracking' }), null, 'ap: moving at 19s');
  // stoplight: fixes at 0.2 m/s from t=20s, 1s apart -> pause once still >= 6s
  let action = null;
  for (let t = 20000; t <= 27000; t += 1000) {
    const a = d.onFix({ speedMps: 0.2, accuracyM: 5, tMs: t, status: 'tracking' });
    if (a) { action = { a, t }; break; }
  }
  eq(action && action.a, 'pause', 'ap: pause fires');
  eq(action && action.t, 26000, 'ap: pause after 6s of stillness');
  // noisy fixes while autopaused are ignored
  eq(d.onFix({ speedMps: 2.0, accuracyM: 40, tMs: 28000, status: 'autopaused' }), null, 'ap: bad accuracy ignored');
  eq(d.onFix({ speedMps: -1, accuracyM: 5, tMs: 28500, status: 'autopaused' }), null, 'ap: invalid speed ignored');
  // resume needs 2 consecutive good moving fixes
  eq(d.onFix({ speedMps: 1.2, accuracyM: 5, tMs: 29000, status: 'autopaused' }), null, 'ap: first moving fix no resume');
  eq(d.onFix({ speedMps: 1.2, accuracyM: 5, tMs: 30000, status: 'autopaused' }), 'resume', 'ap: resume on second');
  // a slow fix between moving fixes resets the resume count
  eq(d.onFix({ speedMps: 1.2, accuracyM: 5, tMs: 31000, status: 'autopaused' }), null, 'ap: count 1');
  eq(d.onFix({ speedMps: 0.2, accuracyM: 5, tMs: 32000, status: 'autopaused' }), null, 'ap: slow resets count');
  eq(d.onFix({ speedMps: 1.2, accuracyM: 5, tMs: 33000, status: 'autopaused' }), null, 'ap: count 1 again');
  eq(d.onFix({ speedMps: 1.2, accuracyM: 5, tMs: 34000, status: 'autopaused' }), 'resume', 'ap: resume again');
}

// ---------- auto-pause: noise spikes in the ambiguous band don't reset stillness ----------
{
  const d = RunLogic.createAutoPauseDetector();
  d.onFix({ speedMps: 3.0, accuracyM: 5, tMs: 0, status: 'tracking' }); // clock + immunity anchor
  d.onFix({ speedMps: 3.0, accuracyM: 5, tMs: 19000, status: 'tracking' });
  // stationary GPS jitter: mostly < 0.6 with spikes at 0.85/0.7 (shuffle band, NOT movement)
  const speeds = [0.4, 0.5, 0.85, 0.45, 0.7, 0.5, 0.48];
  let fired = null;
  speeds.forEach((s, i) => {
    const a = d.onFix({ speedMps: s, accuracyM: 5, tMs: 20000 + i * 1000, status: 'tracking' });
    if (a) fired = { a, t: 20000 + i * 1000 };
  });
  eq(fired && fired.a, 'pause', 'ap-noise: pause still fires through shuffle spikes');
  eq(fired && fired.t, 26000, 'ap-noise: pause timing unchanged');
  // real movement (>= 1.0) resets the window
  const d2 = RunLogic.createAutoPauseDetector();
  d2.onFix({ speedMps: 3.0, accuracyM: 5, tMs: 0, status: 'tracking' });
  d2.onFix({ speedMps: 0.2, accuracyM: 5, tMs: 20000, status: 'tracking' });
  d2.onFix({ speedMps: 2.5, accuracyM: 5, tMs: 23000, status: 'tracking' }); // reset
  eq(d2.onFix({ speedMps: 0.2, accuracyM: 5, tMs: 26500, status: 'tracking' }), null, 'ap-noise: real movement resets');
  eq(d2.onFix({ speedMps: 0.2, accuracyM: 5, tMs: 32000, status: 'tracking' }), null, 'ap-noise: not yet 6s from re-still');
  eq(d2.onFix({ speedMps: 0.2, accuracyM: 5, tMs: 32600, status: 'tracking' }), 'pause', 'ap-noise: pause 6s after re-still');
}

// ---------- buildFinishSummary ----------
{
  const s = RunLogic.buildFinishSummary({ miles: 2.05, seconds: 1210, paceSecPerMile: 590, goalMiles: 2 });
  eq(s, 'Run finished. 2.05 miles in twenty minutes, ten seconds. Average pace nine fifty per mile. Goal complete.', 'summary: goal run');
  const s2 = RunLogic.buildFinishSummary({ miles: 2.0, seconds: 1180, paceSecPerMile: 590, goalMiles: null });
  eq(s2, 'Run finished. Two miles in nineteen minutes, forty seconds. Average pace nine fifty per mile.', 'summary: integer miles phrased, no goal line');
  const s3 = RunLogic.buildFinishSummary({ miles: 1.4, seconds: 900, paceSecPerMile: null, goalMiles: 2 });
  eq(s3, 'Run finished. 1.4 miles in fifteen minutes.', 'summary: no pace, goal missed = no goal line');
}

if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nAll run-logic tests passed');

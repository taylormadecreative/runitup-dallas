// ===== PURE RUN LOGIC =====
// Milestone announcements, auto-pause detection, and speech phrasing.
// Everything here is deterministic — time always arrives as an argument —
// so it runs identically in the app and under node (tests/run-logic.test.js).

const RunLogic = (() => {
  const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

  function numWords(n) {
    n = Math.floor(n);
    if (n < 0 || n > 99) return String(n);
    if (n < 20) return ONES[n];
    const t = TENS[Math.floor(n / 10)];
    return n % 10 ? `${t}-${ONES[n % 10]}` : t;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // 1180000 -> "nineteen minutes, forty seconds"
  function phraseDuration(ms) {
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (h) parts.push(`${numWords(h)} hour${h === 1 ? '' : 's'}`);
    if (m) parts.push(`${numWords(m)} minute${m === 1 ? '' : 's'}`);
    if (s) parts.push(`${numWords(s)} second${s === 1 ? '' : 's'}`);
    if (!parts.length) return 'zero seconds';
    return parts.join(', ');
  }

  // 590 -> "nine fifty"; 545 -> "nine oh five"; 600 -> "ten flat"
  function phrasePace(secPerMile) {
    if (!isFinite(secPerMile) || secPerMile == null || secPerMile <= 0) return null;
    const m = Math.floor(secPerMile / 60);
    const s = Math.floor(secPerMile % 60);
    if (m < 1 || m > 99) return null;
    if (s === 0) return `${numWords(m)} flat`;
    if (s < 10) return `${numWords(m)} oh ${numWords(s)}`;
    return `${numWords(m)} ${numWords(s)}`;
  }

  // 2 -> "two miles"; 0.5 -> "half a mile"; 2.5 -> "2.5 miles"
  function phraseMiles(miles) {
    if (Math.abs(miles - 0.25) < 1e-9) return 'a quarter mile';
    if (Math.abs(miles - 0.5) < 1e-9) return 'half a mile';
    if (Number.isInteger(miles) && miles >= 0 && miles <= 20) {
      return `${numWords(miles)} mile${miles === 1 ? '' : 's'}`;
    }
    // Fractions read naturally as digits ("2.5 miles" -> "two point five miles")
    return `${+miles.toFixed(2)} miles`;
  }

  function milesForSpeech(miles) {
    const rounded = +miles.toFixed(2);
    return Number.isInteger(rounded) ? phraseMiles(rounded) : `${rounded} miles`;
  }

  function mileSplit(wholeMile, miles, elapsedMs) {
    const pace = phrasePace((elapsedMs / 1000) / miles);
    const base = `Mile ${numWords(wholeMile)}. Total time ${phraseDuration(elapsedMs)}.`;
    return pace ? `${base} Average pace ${pace}.` : base;
  }

  // Fires each milestone at most once. goalMiles may be null (splits only).
  function createMilestoneEngine(goalMiles) {
    const goal = (isFinite(goalMiles) && goalMiles > 0) ? goalMiles : null;
    let st = { milesAnnounced: 0, halfwayDone: false, finalDone: false, goalDone: false, lastMileElapsedMs: 0 };

    function onSample({ miles, elapsedMs }) {
      const out = [];
      if (st.goalDone) return out;

      const wholeMile = Math.floor(miles + 1e-9);
      if (wholeMile >= 1 && wholeMile > st.milesAnnounced) {
        out.push(mileSplit(wholeMile, miles, elapsedMs)); // only the latest mile — no backlog spam
        st.milesAnnounced = wholeMile;
        st.lastMileElapsedMs = elapsedMs;
      }

      const goalFires = goal !== null && miles >= goal;
      if (goal !== null && !goalFires) {
        if (!st.halfwayDone && miles >= goal / 2) {
          st.halfwayDone = true;
          const remaining = Math.max(0.25, Math.round((goal - miles) * 4) / 4);
          out.push(`Halfway there. ${cap(phraseMiles(remaining))} to go.`);
        }
        if (!st.finalDone && goal >= 0.75 && miles >= goal - 0.25) {
          st.finalDone = true;
          out.push('Quarter mile to go. Finish strong.');
        }
      }
      if (goalFires) {
        st.goalDone = true;
        st.halfwayDone = true;
        st.finalDone = true;
        out.push(`Goal hit. ${cap(phraseMiles(goal))}. Way to run it up.`);
      }
      return out;
    }

    return {
      onSample,
      state: () => ({ ...st }),
      restore: (saved) => { if (saved) st = { ...st, ...saved }; }
    };
  }

  // Stopped = < 0.6 m/s sustained 6 s (after 15 s run-start immunity).
  // Moving again = >= 1.0 m/s on 2 consecutive fixes.
  const AP = { STILL_MPS: 0.6, MOVE_MPS: 1.0, STILL_MS: 6000, IMMUNITY_MS: 15000, MAX_ACCURACY_M: 20 };

  function createAutoPauseDetector() {
    let t0 = null;
    let stillSince = null;
    let movingCount = 0;

    function onFix({ speedMps, accuracyM, tMs, status }) {
      if (accuracyM > AP.MAX_ACCURACY_M || speedMps < 0) return null; // noisy fix — no window movement
      if (t0 === null) t0 = tMs;

      if (status === 'tracking') {
        if (tMs - t0 < AP.IMMUNITY_MS) return null;
        if (speedMps < AP.STILL_MPS) {
          if (stillSince === null) stillSince = tMs;
          if (tMs - stillSince >= AP.STILL_MS) { stillSince = null; return 'pause'; }
        } else {
          stillSince = null;
        }
        return null;
      }

      if (status === 'autopaused') {
        if (speedMps >= AP.MOVE_MPS) {
          movingCount++;
          if (movingCount >= 2) { movingCount = 0; return 'resume'; }
        } else {
          movingCount = 0;
        }
        return null;
      }
      return null;
    }

    return { onFix, reset: () => { stillSince = null; movingCount = 0; } };
  }

  function buildFinishSummary({ miles, seconds, paceSecPerMile, goalMiles }) {
    let s = `Run finished. ${cap(milesForSpeech(miles))} in ${phraseDuration(seconds * 1000)}.`;
    const pace = phrasePace(paceSecPerMile);
    if (pace) s += ` Average pace ${pace} per mile.`;
    if (goalMiles && miles >= goalMiles) s += ' Goal complete.';
    return s;
  }

  return { phraseDuration, phrasePace, phraseMiles, createMilestoneEngine, createAutoPauseDetector, buildFinishSummary };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RunLogic;
else window.RunLogic = RunLogic;

# Run Detail & History ("Nike-style" post-run summary) — Design Spec

**Date:** 2026-08-12 · **Ships as:** v1.6 (or folds into v1.5 at Nelson's call) · **Approved by Nelson:** yes (conversation, 8/11–8/12)

## Problem

After a run, the app shows a dismiss-once "RUN LOGGED" card and the run disappears — nothing in
the client ever reads `public.runs` back. Nelson loves Nike Run Club's post-run screens (big
distance, metric tiles, pace-colored route map, per-mile splits, weather) and wants the same in
Run It UP. The data is mostly already there: every run stores GPS route points (~5 m apart,
phone and watch), distance/time/pace, and watch runs carry avg heart rate.

## Decisions (user-approved)

1. **History + post-run**: a "My Runs" list on the Stats tab; every run opens the full detail
   screen; the same screen (with a "RUN LOGGED ✓" strip) replaces the current post-run card.
2. **Metrics: all of Nike's set except cadence** — distance, pace, time, splits, route map,
   heart rate, plus newly derived elevation gain, calories, and weather. Cadence cut (needs the
   Motion & Fitness permission for the least-loved metric).
3. **Real street map**: Leaflet + OpenStreetMap tiles, vendored locally (no CDN, no API key).
4. **Approach A — compute-on-view**: every derived metric is computed when the screen opens,
   from stored data. The save path, RPC (12 args), and watch payload are untouched. The ONLY
   DB changes in the feature are `users.weight_lbs` and, if missing, a select-own RLS policy
   on `runs` (one migration).

## Screens

### My Runs (Stats tab section, under the streak hero)

- Paged list of the signed-in user's runs, newest first (50 per page, load-more).
- Row: date ("Mon, Aug 11"), miles (big), pace + duration (small), lime GOAL ring when
  `goal_hit`, watch glyph when `source = 'watch'`.
- Tap → run detail overlay. Works on web/desktop too (viewing ≠ GPS tracking; the desktop
  layout gets the section).

### Run detail (full-screen overlay, app dark style)

1. Header: run date + time of day, close control. (No run-name editing — cut.)
2. Big distance number (Big Shoulders Display) with "Miles" label.
3. Tile grid, 2×3: Avg Pace · Time · Calories / Elevation Gain · Avg Heart Rate · Weather
   (temp °F + condition icon). Missing metrics render "—" so the grid never reflows
   (HR on phone runs, elevation on pre-update runs, weather offline).
   Calories tile with no weight set: "Set weight in Profile" nudge (tappable).
4. Map: Leaflet + OSM (attribution shown), route as a pace-colored polyline — segments
   bucketed green (fast) → yellow → orange (slow) against the run's own pace range; green
   start dot, red end dot, "1 mi"/"2 mi" markers at split boundaries.
5. Splits: one row per mile — mile number, pace, horizontal bar scaled to the fastest split,
   per-mile elevation delta when altitude exists; trailing partial mile shown as its fraction
   ("0.18").
6. "Share This Run" — reuses the existing canvas share card unchanged.

### Post-run flow

`stopRun()` success no longer shows the old summary card; it opens this detail screen for the
just-saved run with a "RUN LOGGED ✓" confirmation strip. One code path serves both entries.

### Profile

New "Weight (lbs)" field in Profile settings. **Production reality:** `public.users` is
world-readable (pre-existing policy), so weight does not go through `updateUserProfile`/
`pace_group` like the rest of profile settings — it's synced to a dedicated self-only
`user_settings` table instead (see DB below).

## Architecture

### `js/run-metrics.js` — pure computation (node-tested; no DOM, no network)

Input: a run row (`route_points`, `duration_seconds`, `distance_miles`, `avg_pace_sec_per_mile`,
`avg_heart_rate`) + `weight_lbs`. Output:

- **Splits**: walk points accumulating haversine distance; interpolate crossing time at each
  mile boundary; split pace = interpolated time delta per mile; final partial split carries its
  fraction. Point timestamps make paused time land inside the split where it happened (same
  philosophy as auto-pause).
- **Pace segments** for the map: consecutive point pairs bucketed by local pace into the
  green→yellow→orange ramp, normalized to this run's own range.
- **Elevation gain**: sum of positive deltas over altitude samples after smoothing, with a
  climb threshold (~3 m) so GPS altitude jitter doesn't invent hills. No altitude → null.
- **Calories**: `0.75 × weight_lbs × miles` (standard gross running estimate; the tile labels
  it an estimate). No weight → null.

### `js/run-detail.js` — list + overlay UI

- Fetches the user's runs from Supabase (first client read of `runs` ever — see RLS below),
  renders My Runs and the detail overlay, calls `run-metrics`, initializes Leaflet lazily
  (only when a detail opens), fetches weather async.
- **Weather**: Open-Meteo archive endpoint (no key) with the run's start date + first route
  point, nearest hour to `started_at`; runs newer than the archive lag (~5 days) use the
  forecast endpoint's `past_days` window. Cached locally per run (client cache keyed by run
  id, size-capped) — each run fetches once, ever. No DB weather column.

### Native + capture (the only native change)

- `RunEnginePlugin.swift` location payload gains `altitude` + `verticalAccuracy`.
- `run-tracker.js` adds `alt` to a stored route point when vertical accuracy is acceptable.
  Point shape becomes `{lat, lng, time, alt?}` — `route_points` is jsonb, so no schema change.
- Watch app untouched in v1 → watch runs show "—" elevation.

### DB (the only migration)

- **Production reality (amended):** `users.weight_lbs` was added, then dropped in the same
  branch once it was clear `public.users` carries a world-readable SELECT policy — body
  weight can't live there. It now lives in its own `user_settings` table
  (`user_id` PK/FK, `weight_lbs`, `updated_at`) with `RLS FOR ALL USING (user_id = auth.uid())`,
  so only the owner can read or write their own row.
- **RLS verify**: nothing has ever SELECTed `runs` from the client; the plan must verify a
  select-own policy exists (`user_id = auth.uid()`) and add it in the same migration if missing.
- `save_run_with_checkin` unchanged. Watch payload unchanged.

### Vendoring

Leaflet JS+CSS into `assets/vendor/` beside `supabase.min.js`, loaded lazily by `run-detail.js`
the first time a detail overlay opens (zero boot cost); OSM raster tiles with the required
attribution control. No CDN at runtime, matching the self-contained-assets rule.

## Error handling

The screen displays; it never touches tracking or saving.

- No/empty `route_points` → "No route recorded" strip in place of the map; aggregates still render.
- Weather fetch fails/offline → "—" tile, retry next open, never blocks.
- No weight → calories nudge only.
- Runs SELECT fails → the app's standard friendly network-error state with retry in My Runs.
- OSM tiles unreachable → polyline still draws on the bare map canvas.
- Splits edge cases live in the pure module: empty/single-point runs, sub-mile runs,
  decimated 2000-point runs.

## Testing

1. **Unit (node)**: `tests/run-metrics.test.js` — synthetic point tracks with known
   distances/times → exact splits; noisy altitude series → expected gain; empty/single-point/
   sub-mile/decimated inputs; calories/weight matrix.
2. **Browser (web build, Playwright)**: My Runs list against real DB rows, detail overlay
   rendering, map + splits + tiles, weather tile fill, error states (no points, no weight).
   No simulator needed — nothing here is native except altitude forwarding.
3. **Device (piggybacks on the next device session, e.g. the music-controls Task 6 run)**:
   confirm altitude arrives on new runs and the elevation tile populates.
4. Existing run-save E2E passes unchanged; the post-run screen swap is explicitly verified.

## Out of scope (deliberate v1 cuts)

Cadence, run-name editing, HR/elevation time-series charts ("More Details"), watch-run
elevation, DB-stored weather backfill, share-card changes, route privacy zones.

## Amendments (2026-08-14)

- **Calories nudge is now inline.** "Set weight in Profile" closed the overlay and navigated
  away with no route back to the number it was collected for. The nudge now reads "Add weight
  for calories" and swaps the tile itself for an inline lbs input + Save
  (`RunDetail.promptWeight`/`saveWeight`); on save it persists via profile.js
  `saveWeightSetting`, paints calories in place, and updates `overlay._metrics.calories`.
  No longer native-gated — works on web too.
- **Share-card changes un-cut.** `shareRunSummary` gained an `extras` param (calories,
  elevation, avg HR, weather from the run's wx cache, pace-colored segments, splits, date
  label). The card mirrors the detail screen: logo, date, miles hero, stat grid (tiles with
  no data are dropped, not dashed), the route on REAL OSM street tiles (fetched
  `crossOrigin='anonymous'` — OSM sends ACAO:*, so the canvas stays untainted and `toBlob`
  works), mile pills (thinned to ≤~6 on long runs), ODbL attribution, and a SPLITS section
  (per-mile pace, ramp-colored bars, elev deltas; rows truncate before the map drops below
  320px). Hardening from the adversarial review: 4s deadline per tile (stalled cellular
  degrades to dark-panel trace, never hangs), in-flight guard + awaited toBlob/share +
  "Building card…" button state, honest error toast on native share failure (the
  `<a download>` fallback is inert in WKWebView), and ~120m trimmed off each route end on
  the card so a from-home run never pinpoints the door. privacy.html corrected to admit
  precise-location collection during runs + OSM/Open-Meteo third parties. Fixture render
  harness: `tests/share-card-harness.html`.

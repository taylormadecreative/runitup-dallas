// Unit tests for js/music-bar-logic.js — run with: node tests/music-bar-logic.test.js
const MusicBarLogic = require('../js/music-bar-logic.js');

let failures = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}\n  expected: ${e}\n  actual:   ${a}`); }
  else console.log(`ok ${label}`);
}

const base = {
  native: true, authStatus: 'authorized', playbackState: 'stopped',
  otherAudioPlaying: false, spotifyInstalled: false, nowPlaying: null
};
const track = { title: 'HUMBLE.', artist: 'Kendrick Lamar', artworkBase64: 'abc123' };

// ---------- hidden ----------
eq(MusicBarLogic.barState(null), { mode: 'hidden' }, 'null snapshot -> hidden');
eq(MusicBarLogic.barState({ ...base, native: false }), { mode: 'hidden' }, 'not native -> hidden');

// ---------- transport: Music app is the player ----------
eq(MusicBarLogic.barState({ ...base, playbackState: 'playing', nowPlaying: track }),
   { mode: 'transport', playing: true, lite: false, title: 'HUMBLE.', subtitle: 'Kendrick Lamar', artworkBase64: 'abc123' },
   'authorized playing -> full transport');
eq(MusicBarLogic.barState({ ...base, playbackState: 'paused', nowPlaying: track }),
   { mode: 'transport', playing: false, lite: false, title: 'HUMBLE.', subtitle: 'Kendrick Lamar', artworkBase64: 'abc123' },
   'authorized paused with queue -> paused transport');
eq(MusicBarLogic.barState({ ...base, playbackState: 'interrupted', nowPlaying: track }).playing,
   false, 'interrupted counts as paused');

// Music playing wins even if otherAudioPlaying is true (the Music app IS
// "other audio" from our audio session's point of view).
eq(MusicBarLogic.barState({ ...base, playbackState: 'playing', otherAudioPlaying: true, nowPlaying: track }).mode,
   'transport', 'Music playing beats otherAudioPlaying');

// ---------- transport lite: no library permission ----------
eq(MusicBarLogic.barState({ ...base, authStatus: 'notDetermined', playbackState: 'playing' }),
   { mode: 'transport', playing: true, lite: true, title: 'Music', subtitle: '', artworkBase64: null },
   'unauthorized playing -> lite transport');
eq(MusicBarLogic.barState({ ...base, authStatus: 'denied', playbackState: 'paused' }),
   { mode: 'transport', playing: false, lite: true, title: 'Music', subtitle: '', artworkBase64: null },
   'denied paused -> lite transport (paused implies a queue exists)');
// Defensive: nowPlaying present but unauthorized -> still lite (never trust it)
eq(MusicBarLogic.barState({ ...base, authStatus: 'denied', playbackState: 'playing', nowPlaying: track }).lite,
   true, 'unauthorized ignores nowPlaying');

// ---------- other-app (Spotify etc.) ----------
eq(MusicBarLogic.barState({ ...base, otherAudioPlaying: true, spotifyInstalled: true }),
   { mode: 'other-app', showOpenSpotify: true }, 'other audio + spotify installed');
eq(MusicBarLogic.barState({ ...base, otherAudioPlaying: true, spotifyInstalled: false }),
   { mode: 'other-app', showOpenSpotify: false }, 'other audio, no spotify');
eq(MusicBarLogic.barState({ ...base, otherAudioPlaying: true, playbackState: 'paused', nowPlaying: track }).mode,
   'other-app', 'other audio beats a merely-paused Music queue');

// ---------- start-music ----------
eq(MusicBarLogic.barState(base), { mode: 'start-music' }, 'authorized stopped empty -> start-music');
eq(MusicBarLogic.barState({ ...base, playbackState: 'paused', nowPlaying: null }),
   { mode: 'start-music' }, 'authorized paused but NO item -> start-music (no real queue)');
eq(MusicBarLogic.barState({ ...base, authStatus: 'notDetermined' }),
   { mode: 'start-music' }, 'unauthorized stopped -> start-music');

// ---------- missing-title fallback ----------
eq(MusicBarLogic.barState({ ...base, playbackState: 'playing', nowPlaying: { title: '', artist: '' } }).title,
   'Untitled', 'empty title -> Untitled');

process.exit(failures ? 1 : 0);

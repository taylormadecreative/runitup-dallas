// ===== MUSIC BAR STATE MACHINE =====
// Pure function: MusicRemote state snapshot -> what the bar should render.
// No DOM, no Capacitor — unit-tested in node (tests/music-bar-logic.test.js).
//
// Rule order matters:
//   1. Music app actively playing -> transport. (Checked before otherAudioPlaying,
//      because the Music app itself counts as "other audio" to our session.)
//   2. Other audio active -> the Spotify/podcast fallback.
//   3. Music app paused/interrupted -> paused transport IF a queue exists
//      (unauthorized we can't see the queue, but paused implies one).
//   4. Everything else -> "start your music".

const MusicBarLogic = {
  barState(snapshot) {
    const s = snapshot || {};
    if (!s.native) return { mode: 'hidden' };
    const authed = s.authStatus === 'authorized';
    const np = authed && s.nowPlaying ? s.nowPlaying : null;
    const transport = (playing) => ({
      mode: 'transport',
      playing,
      lite: !np,
      title: np ? (np.title || 'Untitled') : 'Music',
      subtitle: np ? (np.artist || '') : '',
      artworkBase64: np ? (np.artworkBase64 || null) : null
    });
    if (s.playbackState === 'playing') return transport(true);
    if (s.otherAudioPlaying) return { mode: 'other-app', showOpenSpotify: !!s.spotifyInstalled };
    if (s.playbackState === 'paused' || s.playbackState === 'interrupted') {
      if (authed && !np) return { mode: 'start-music' };
      return transport(false);
    }
    return { mode: 'start-music' };
  }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = MusicBarLogic; }
if (typeof window !== 'undefined') { window.MusicBarLogic = MusicBarLogic; }

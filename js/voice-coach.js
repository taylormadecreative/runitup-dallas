// ===== VOICE COACH =====
// Speaks through RunEngine's on-device synthesis (music ducks while talking).
// Registers on the run tracker's event bus; every call is failure-safe and a
// no-op on web, on Android, or when the Voice Coach setting is off.

const VoiceCoach = (() => {
  const engine = () => window.Capacitor?.Plugins?.RunEngine;

  function isOn() {
    return !!(window.Capacitor?.isNativePlatform() && engine() && riuSetting('riu_voice_coach') === 'on');
  }

  async function say(text) {
    if (!isOn() || !text) return;
    try { await engine().speak({ text }); } catch (err) { console.warn('[voice-coach]', err); }
  }

  const statusLines = {
    paused: 'Paused.',
    autopaused: 'Auto-paused.',
    tracking: 'Back on.'
  };

  function onMilestones(utterances) {
    say(utterances.join(' '));
  }

  function onStatusChange(status, ctx) {
    if (status === 'finished') {
      if (ctx && window.RunLogic) say(RunLogic.buildFinishSummary(ctx));
      return;
    }
    if (statusLines[status]) say(statusLines[status]);
  }

  return { isOn, say, onMilestones, onStatusChange };
})();

window.VoiceCoach = VoiceCoach;
window.RunTrackerEvents?.listeners.push({
  onMilestones: (utterances) => VoiceCoach.onMilestones(utterances),
  onStatusChange: (status, ctx) => VoiceCoach.onStatusChange(status, ctx)
});

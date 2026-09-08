export const COACH_VOICE_STOP_PLAYBACK = 'trophe:coach-voice-stop-playback';

export function stopCoachVoicePlayback(): void {
  if (typeof window === 'undefined') return;
  window.speechSynthesis?.cancel();
  window.dispatchEvent(new Event(COACH_VOICE_STOP_PLAYBACK));
}

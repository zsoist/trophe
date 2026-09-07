import { startAudioRecordingSession } from '@/lib/microphone/recording-session';

/** Existing microphone/transcription stack limits take precedence over 90s/15MiB. */
export const COACH_AUDIO_LIMITS={durationMs:30_000,fileBytes:2*1024*1024} as const;
/** Same microphone lifecycle as Food/intake; the UI cancels on owner/thread change. */
export function startCoachAudioRecording(options:Omit<Parameters<typeof startAudioRecordingSession>[0],'maxDurationMs'>) {
  return startAudioRecordingSession({...options,maxDurationMs:COACH_AUDIO_LIMITS.durationMs});
}

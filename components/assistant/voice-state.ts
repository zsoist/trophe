import { COACH_AUDIO_LIMITS, startCoachAudioRecording } from '@/agents/coach-assistant/voice-capture';
import type { AudioRecordingSession } from '@/lib/microphone/recording-session';
export interface VoiceState {
  phase: 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready';
  recording: { blob: Blob; url: string; durationMs: number } | null;
  error: 'permission' | 'unsupported' | 'failed' | 'limit' | null;
  elapsedMs: number;
}
const empty = (): VoiceState => ({ phase: 'idle', recording: null, error: null, elapsedMs: 0 });
/** Local capture only. No upload, transcription, message submission or memory writes. */
export class VoiceController {
  private state = empty();
  private listeners = new Set<() => void>();
  private session: AudioRecordingSession | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private readonly startSession = startCoachAudioRecording) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: VoiceState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private clearTimer() { if (this.timer !== null) clearInterval(this.timer); this.timer = null; }
  reset() {
    this.clearTimer();
    this.generation++; this.session?.cancel(); this.session = null;
    if (this.state.recording) URL.revokeObjectURL(this.state.recording.url);
    this.publish(empty());
  }
  start() {
    if (['requesting', 'recording', 'stopping'].includes(this.state.phase)) return;
    this.reset();
    const generation = this.generation;
    const valid = () => generation === this.generation;
    this.publish({ ...empty(), phase: 'requesting' });
    try {
      const session = this.startSession({
        onRequesting: () => { if (valid()) this.publish({ ...empty(), phase: 'requesting' }); },
        onRecording: () => {
          if (!valid()) return;
          this.clearTimer();
          const startedAt = performance.now();
          this.publish({ ...empty(), phase: 'recording' });
          this.timer = setInterval(() => {
            if (valid() && this.state.phase === 'recording') this.publish({ ...this.state, elapsedMs: Math.min(COACH_AUDIO_LIMITS.durationMs, Math.max(0, performance.now() - startedAt)) });
          }, 250);
        },
        onComplete: result => {
          if (!valid()) return;
          this.clearTimer();
          this.session = null;
          if (result.blob.size < 1 || result.blob.size > COACH_AUDIO_LIMITS.fileBytes || !Number.isFinite(result.durationMs) || result.durationMs < 0 || result.durationMs > COACH_AUDIO_LIMITS.durationMs) { this.publish({ ...empty(), error: 'limit' }); return; }
          this.publish({ phase: 'ready', error: null, elapsedMs: result.durationMs, recording: { blob: result.blob, url: URL.createObjectURL(result.blob), durationMs: result.durationMs } });
        },
        onError: error => {
          if (!valid()) return;
          this.clearTimer();
          this.session = null;
          this.publish({ ...empty(), error: error === 'permission-denied' ? 'permission' : error === 'unsupported' ? 'unsupported' : 'failed' });
        },
      });
      if (session.active && valid()) this.session = session;
      else session.cancel();
    } catch { if (valid()) { this.clearTimer(); this.publish({ ...empty(), error: 'failed' }); } }
  }
  stop() {
    if (this.state.phase !== 'recording') return;
    this.clearTimer();
    this.publish({ ...this.state, phase: 'stopping' });
    this.session?.stop();
  }
}

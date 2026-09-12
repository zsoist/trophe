import type { LivePlaybackPort } from './client-types';

/** Owns the actual remote WebRTC audio element, never the microphone or backend work. */
export function createBrowserLivePlayback(
  audio: HTMLAudioElement,
  onBlocked: () => void,
): LivePlaybackPort & { attach(stream: MediaStream): void; dispose(): void } {
  let disposed = false;
  let generation = 0;
  const play = () => {
    if (disposed || !audio.srcObject) return;
    const current = ++generation;
    try {
      void audio.play().catch(() => {
        if (!disposed && current === generation && !audio.muted) onBlocked();
      });
    } catch {
      if (!disposed && current === generation && !audio.muted) onBlocked();
    }
  };
  return {
    attach(stream) {
      if (disposed) return;
      audio.muted = false;
      audio.srcObject = stream;
      play();
    },
    stopOutput() {
      if (disposed) return;
      generation++;
      audio.muted = true;
      audio.pause();
    },
    resumeOutput() {
      if (disposed) return;
      audio.muted = false;
      play();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      audio.pause();
      audio.srcObject = null;
    },
  };
}

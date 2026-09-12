import type { LivePlaybackEvent, LivePlaybackPort, LivePlaybackStatus } from './client-types';

/**
 * Owns the actual remote WebRTC audio element, never the microphone or backend work.
 *
 * It also reports its real status (and remote-stream attach/replacement) to optional
 * observers so the lifecycle can drive output metering from what is actually playing.
 * A `play()` that resolves after a pause/interrupt/dispose never flips the status back to
 * `playing`: the newer generation wins, so interrupted audio cannot silently resume.
 */
export function createBrowserLivePlayback(
  audio: HTMLAudioElement,
  onBlocked: () => void,
): LivePlaybackPort & { attach(stream: MediaStream): void; dispose(): void } {
  let disposed = false;
  let generation = 0;
  let status: LivePlaybackStatus = 'detached';
  let stream: MediaStream | null = null;
  const observers = new Set<(event: LivePlaybackEvent) => void>();

  const emit = (event: LivePlaybackEvent): void => {
    for (const observer of [...observers]) {
      try {
        observer(event);
      } catch {
        // A broken observer must never break playback ownership.
      }
    }
  };
  const setStatus = (next: LivePlaybackStatus): void => {
    if (status === next) return;
    status = next;
    emit({ type: 'status', status: next });
  };
  const play = () => {
    if (disposed || !audio.srcObject) return;
    const current = ++generation;
    // Only a resolved, still-current play() marks the output as really sounding.
    try {
      void audio.play().then(
        () => {
          // A pause/interrupt/dispose that raced this play must win.
          if (disposed || current !== generation || audio.muted) return;
          setStatus('playing');
        },
        () => {
          if (disposed || current !== generation || audio.muted) return;
          setStatus('blocked');
          onBlocked();
        },
      );
    } catch {
      if (!disposed && current === generation && !audio.muted) {
        setStatus('blocked');
        onBlocked();
      }
    }
  };
  return {
    attach(nextStream) {
      if (disposed) return;
      stream = nextStream;
      audio.muted = false;
      audio.srcObject = nextStream;
      // A replacement stream is NOT audible yet. The previous stream's `playing` status must
      // never leak onto the new media while its own `play()` is still pending (or is refused):
      // invalidate audibility BEFORE announcing the new binding, so the lifecycle drops the old
      // output level and cannot show the replacement as "speaking" before playback is confirmed.
      // Only a current, resolved `play()` restores `playing`.
      if (status === 'playing') setStatus('paused');
      // Tell observers the exact remote media that is now bound (or replaced).
      emit({ type: 'stream', stream: nextStream });
      play();
    },
    stopOutput() {
      if (disposed) return;
      generation++;
      audio.muted = true;
      audio.pause();
      setStatus('paused');
    },
    resumeOutput() {
      if (disposed) return;
      audio.muted = false;
      play();
    },
    observe(listener) {
      observers.add(listener);
      // Replay the current binding so a late observer is not blind to an attached stream.
      if (stream) listener({ type: 'stream', stream });
      listener({ type: 'status', status });
      return () => {
        observers.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      audio.pause();
      audio.srcObject = null;
      stream = null;
      status = 'detached';
      emit({ type: 'stream', stream: null });
      observers.clear();
    },
  };
}

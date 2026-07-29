interface StoppableTrack {
  stop(): void;
}

interface MediaTrackSource {
  getTracks(): readonly StoppableTrack[];
}

export function stopMediaStream(stream: MediaTrackSource | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      // Continue releasing the remaining tracks.
    }
  }
}

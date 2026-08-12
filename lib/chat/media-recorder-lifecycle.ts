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

export function chatAudioAttachmentDetails(mimeType: string, durationMs: number): {
  duration_s: number;
  ext: 'm4a' | 'ogg' | 'webm';
  mime: string;
} {
  const mime = mimeType.split(';')[0] || 'audio/webm';
  return {
    duration_s: Math.max(0, Math.round(durationMs / 1_000)),
    ext: mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm',
    mime,
  };
}

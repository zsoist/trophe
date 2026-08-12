export interface MediaStreamTrackLike {
  stop: () => void;
}

export interface MediaStreamLike {
  getTracks: () => MediaStreamTrackLike[];
}

export interface MediaRecorderLike {
  state: 'inactive' | 'recording' | 'paused';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: { error?: unknown }) => void) | null;
  start: () => void;
  stop: () => void;
}

export type RecordingError =
  | 'permission-denied'
  | 'unsupported'
  | 'no-audio'
  | 'recorder-error'
  | 'start-failed';

export interface AudioRecordingResult {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  reason: 'stopped' | 'limit';
}

export interface AudioRecordingSession {
  readonly active: boolean;
  stop: () => void;
  cancel: () => void;
}

interface StartAudioRecordingSessionOptions {
  maxDurationMs: number;
  onRequesting: () => void;
  onRecording: () => void;
  onComplete: (result: AudioRecordingResult) => void;
  onError: (error: RecordingError) => void;
  acquireStream?: () => Promise<MediaStreamLike>;
  createRecorder?: (
    stream: MediaStreamLike,
    options: { mimeType?: string; audioBitsPerSecond?: number },
  ) => MediaRecorderLike;
  isTypeSupported?: (mimeType: string) => boolean;
  now?: () => number;
}

const MIME_TYPE_PREFERENCES = ['audio/webm;codecs=opus', 'audio/mp4'] as const;
const AUDIO_BITS_PER_SECOND = 32_000;

function stopStream(stream: MediaStreamLike | null): void {
  stream?.getTracks().forEach(track => track.stop());
}

function mapAcquireError(error: unknown): RecordingError {
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'permission-denied';
  }
  return 'start-failed';
}

function defaultAcquireStream(): Promise<MediaStreamLike> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(Object.assign(new Error('Audio capture is unavailable'), { name: 'NotSupportedError' }));
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  });
}

function defaultCreateRecorder(
  stream: MediaStreamLike,
  options: { mimeType?: string; audioBitsPerSecond?: number },
): MediaRecorderLike {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is unavailable');
  return new MediaRecorder(stream as MediaStream, options) as unknown as MediaRecorderLike;
}

function defaultIsTypeSupported(mimeType: string): boolean {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType);
}

export function startAudioRecordingSession({
  maxDurationMs,
  onRequesting,
  onRecording,
  onComplete,
  onError,
  acquireStream = defaultAcquireStream,
  createRecorder = defaultCreateRecorder,
  isTypeSupported = defaultIsTypeSupported,
  now = () => performance.now(),
}: StartAudioRecordingSessionOptions): AudioRecordingSession {
  let active = true;
  let stream: MediaStreamLike | null = null;
  let recorder: MediaRecorderLike | null = null;
  let startedAt = 0;
  let completionReason: AudioRecordingResult['reason'] = 'stopped';
  let limitTimer: ReturnType<typeof setTimeout> | null = null;
  const chunks: Blob[] = [];

  const cleanup = () => {
    if (limitTimer) clearTimeout(limitTimer);
    limitTimer = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }
    stopStream(stream);
    stream = null;
  };

  const settle = (finish: () => void) => {
    if (!active) return;
    active = false;
    cleanup();
    finish();
  };

  const finishRecording = () => {
    const mimeType = recorder?.mimeType || chunks[0]?.type || 'application/octet-stream';
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size === 0) {
      settle(() => onError('no-audio'));
      return;
    }
    const durationMs = completionReason === 'limit'
      ? maxDurationMs
      : Math.max(0, Math.round(now() - startedAt));
    settle(() => onComplete({ blob, durationMs, mimeType, reason: completionReason }));
  };

  const stopRecorder = () => {
    if (!active || !recorder || recorder.state === 'inactive') return;
    try {
      recorder.stop();
    } catch {
      settle(() => onError('recorder-error'));
    }
  };

  onRequesting();
  void acquireStream()
    .then(acquiredStream => {
      if (!active) {
        stopStream(acquiredStream);
        return;
      }
      stream = acquiredStream;
      const mimeType = MIME_TYPE_PREFERENCES.find(type => isTypeSupported(type));
      if (!mimeType) {
        settle(() => onError('unsupported'));
        return;
      }

      try {
        recorder = createRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
        recorder.ondataavailable = event => {
          if (active && event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = finishRecording;
        recorder.onerror = () => settle(() => onError('recorder-error'));
        recorder.start();
        startedAt = now();
        onRecording();
        limitTimer = setTimeout(() => {
          completionReason = 'limit';
          stopRecorder();
        }, maxDurationMs);
      } catch {
        settle(() => onError('start-failed'));
      }
    })
    .catch(error => {
      settle(() => onError(mapAcquireError(error)));
    });

  return {
    get active() {
      return active;
    },
    stop() {
      completionReason = 'stopped';
      stopRecorder();
    },
    cancel() {
      if (!active) return;
      active = false;
      if (limitTimer) clearTimeout(limitTimer);
      limitTimer = null;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch {
            // Recorder cleanup is best-effort after cancellation.
          }
        }
      }
      stopStream(stream);
      stream = null;
    },
  };
}

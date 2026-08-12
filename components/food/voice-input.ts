export interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export type VoiceInputError =
  | 'permission-denied'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'timeout'
  | 'start-failed'
  | 'aborted'
  | 'unknown';

export interface VoiceSession {
  readonly active: boolean;
  stop: () => void;
  cancel: () => void;
}

interface StartVoiceSessionOptions {
  recognition: SpeechRecognitionLike;
  language: string;
  onListening: () => void;
  onTranscript: (transcript: string) => void;
  onComplete: (transcript: string) => void;
  onError: (error: VoiceInputError) => void;
}

const MAX_LISTENING_MS = 30_000;
const STOP_FALLBACK_MS = 1_500;

function normalizeTranscript(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function mapRecognitionError(error: string): VoiceInputError {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'audio-capture';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    default:
      return 'unknown';
  }
}

/**
 * Owns one Web Speech recognition lifecycle.
 *
 * Browsers are inconsistent about whether `onend` fires after Stop and may
 * emit a late error/end pair. This controller turns those loose browser
 * callbacks into exactly one completion or error and always becomes inactive.
 */
export function startVoiceSession({
  recognition,
  language,
  onListening,
  onTranscript,
  onComplete,
  onError,
}: StartVoiceSessionOptions): VoiceSession {
  let active = true;
  let latestTranscript = '';
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let stopFallback: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (watchdog) clearTimeout(watchdog);
    if (stopFallback) clearTimeout(stopFallback);
    watchdog = null;
    stopFallback = null;
  };

  const detachHandlers = () => {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  };

  const settle = (finish: () => void) => {
    if (!active) return;
    active = false;
    clearTimers();
    detachHandlers();
    finish();
  };

  const completeFromLatest = () => {
    settle(() => {
      if (latestTranscript) onComplete(latestTranscript);
      else onError('no-speech');
    });
  };

  recognition.lang = language;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // Attach every handler before start(): some implementations can fail or
  // finish synchronously, and attaching afterwards leaves the UI stranded.
  recognition.onresult = event => {
    if (!active) return;
    let combined = '';
    for (let i = 0; i < event.results.length; i += 1) {
      combined += ` ${event.results[i][0].transcript}`;
    }
    const transcript = normalizeTranscript(combined);
    if (!transcript) return;
    latestTranscript = transcript;
    onTranscript(transcript);
  };

  recognition.onerror = event => {
    settle(() => onError(mapRecognitionError(event.error)));
  };

  recognition.onend = () => {
    completeFromLatest();
  };

  try {
    recognition.start();
  } catch {
    settle(() => onError('start-failed'));
  }

  if (active) {
    onListening();
    watchdog = setTimeout(() => {
      settle(() => onError('timeout'));
      try {
        recognition.abort?.();
      } catch {
        // The session is already terminal; a browser abort failure is harmless.
      }
    }, MAX_LISTENING_MS);
  }

  return {
    get active() {
      return active;
    },
    stop() {
      if (!active || stopFallback) return;
      try {
        recognition.stop();
      } catch {
        completeFromLatest();
        return;
      }
      // Safari/Chrome occasionally omit onend after stop. Preserve the live
      // interim transcript and release the UI even when that happens.
      stopFallback = setTimeout(completeFromLatest, STOP_FALLBACK_MS);
    },
    cancel() {
      settle(() => {});
      try {
        recognition.abort?.();
      } catch {
        // Nothing else to clean up after a silent cancellation.
      }
    },
  };
}

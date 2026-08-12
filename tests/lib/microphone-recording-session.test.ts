import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startAudioRecordingSession,
  type AudioRecordingResult,
  type MediaRecorderLike,
  type MediaStreamLike,
  type RecordingError,
} from '@/lib/microphone/recording-session';

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakeRecorder implements MediaRecorderLike {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: { error?: unknown }) => void) | null = null;
  handlersAttachedAtStart = false;
  options: { mimeType?: string; audioBitsPerSecond?: number } | undefined;

  start() {
    this.handlersAttachedAtStart = Boolean(this.ondataavailable && this.onstop && this.onerror);
    this.state = 'recording';
  }

  stop() {
    if (this.state === 'inactive') throw new Error('already inactive');
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['spoken audio'], { type: this.mimeType }) });
    this.onstop?.();
  }

  emitError(error: unknown = new Error('encoder failed')) {
    this.onerror?.({ error });
  }
}

function makeStream(): MediaStreamLike & { stop: ReturnType<typeof vi.fn> } {
  const stop = vi.fn();
  return { stop, getTracks: () => [{ stop }] };
}

function makeState() {
  const completions: AudioRecordingResult[] = [];
  const errors: RecordingError[] = [];
  const statuses: string[] = [];
  return {
    completions,
    errors,
    statuses,
    callbacks: {
      onRequesting: () => statuses.push('requesting'),
      onRecording: () => statuses.push('recording'),
      onComplete: (result: AudioRecordingResult) => completions.push(result),
      onError: (error: RecordingError) => errors.push(error),
    },
  };
}

describe('audio recording session', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('attaches recorder handlers before start and completes exactly once on Stop', async () => {
    const stream = makeStream();
    const recorder = new FakeRecorder();
    const state = makeState();
    const session = startAudioRecordingSession({
      acquireStream: async () => stream,
      createRecorder: (_stream, options) => { recorder.options = options; return recorder; },
      isTypeSupported: type => type === 'audio/webm;codecs=opus',
      maxDurationMs: 30_000,
      ...state.callbacks,
    });

    await vi.waitFor(() => expect(recorder.state).toBe('recording'));
    session.stop();
    recorder.onstop?.();

    expect(recorder.handlersAttachedAtStart).toBe(true);
    expect(recorder.options).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32_000 });
    expect(state.statuses).toEqual(['requesting', 'recording']);
    expect(state.completions).toHaveLength(1);
    expect(state.completions[0].blob.size).toBeGreaterThan(0);
    expect(state.completions[0].reason).toBe('stopped');
    expect(stream.stop).toHaveBeenCalledOnce();
    expect(state.errors).toEqual([]);
    expect(session.active).toBe(false);
  });

  it('cancels permission work and releases a stream that arrives late', async () => {
    const permission = new Deferred<MediaStreamLike>();
    const stream = makeStream();
    const state = makeState();
    const createRecorder = vi.fn(() => new FakeRecorder());
    const session = startAudioRecordingSession({
      acquireStream: () => permission.promise,
      createRecorder,
      isTypeSupported: () => true,
      maxDurationMs: 30_000,
      ...state.callbacks,
    });

    session.cancel();
    permission.resolve(stream);
    await permission.promise;
    await Promise.resolve();

    expect(stream.stop).toHaveBeenCalledOnce();
    expect(createRecorder).not.toHaveBeenCalled();
    expect(state.completions).toEqual([]);
    expect(state.errors).toEqual([]);
    expect(session.active).toBe(false);
  });

  it('auto-stops at the maximum duration and reports a limit completion', async () => {
    const stream = makeStream();
    const recorder = new FakeRecorder();
    const state = makeState();
    startAudioRecordingSession({
      acquireStream: async () => stream,
      createRecorder: () => recorder,
      isTypeSupported: () => true,
      maxDurationMs: 30_000,
      ...state.callbacks,
    });

    await vi.waitFor(() => expect(recorder.state).toBe('recording'));
    vi.advanceTimersByTime(30_000);

    expect(state.completions).toHaveLength(1);
    expect(state.completions[0].reason).toBe('limit');
    expect(state.completions[0].durationMs).toBe(30_000);
    expect(stream.stop).toHaveBeenCalledOnce();
  });

  it('maps permission denial and does not construct a recorder', async () => {
    const state = makeState();
    const createRecorder = vi.fn(() => new FakeRecorder());
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    startAudioRecordingSession({
      acquireStream: async () => { throw denied; },
      createRecorder,
      isTypeSupported: () => true,
      maxDurationMs: 30_000,
      ...state.callbacks,
    });

    await vi.waitFor(() => expect(state.errors).toEqual(['permission-denied']));
    expect(createRecorder).not.toHaveBeenCalled();
  });

  it('settles a recorder error once and releases every track', async () => {
    const stream = makeStream();
    const recorder = new FakeRecorder();
    const state = makeState();
    const session = startAudioRecordingSession({
      acquireStream: async () => stream,
      createRecorder: () => recorder,
      isTypeSupported: () => true,
      maxDurationMs: 30_000,
      ...state.callbacks,
    });

    await vi.waitFor(() => expect(recorder.state).toBe('recording'));
    recorder.emitError();
    recorder.emitError();

    expect(state.errors).toEqual(['recorder-error']);
    expect(state.completions).toEqual([]);
    expect(stream.stop).toHaveBeenCalledOnce();
    expect(session.active).toBe(false);
  });

  it('reports unsupported recording when neither WebM nor MP4 can be encoded', async () => {
    const stream = makeStream();
    const state = makeState();
    const createRecorder = vi.fn(() => new FakeRecorder());
    startAudioRecordingSession({
      acquireStream: async () => stream,
      createRecorder,
      isTypeSupported: () => false,
      maxDurationMs: 30_000,
      ...state.callbacks,
    });

    await vi.waitFor(() => expect(state.errors).toEqual(['unsupported']));
    expect(createRecorder).not.toHaveBeenCalled();
    expect(stream.stop).toHaveBeenCalledOnce();
  });
});

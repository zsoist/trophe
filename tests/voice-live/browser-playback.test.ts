import { describe, expect, it, vi } from 'vitest';
import { createBrowserLivePlayback } from '../../lib/voice-live/browser-playback';

describe('remote audio ownership', () => {
  function setup() {
    const audio = { srcObject: null, muted: false, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    const blocked = vi.fn();
    const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, blocked);
    return { audio, blocked, playback };
  }

  it('interrupts actual audio and resumes it without stopping media tracks', () => {
    const { audio, playback } = setup();
    const track = { stop: vi.fn() };
    playback.attach({ getTracks: () => [track] } as unknown as MediaStream);
    expect(audio.play).toHaveBeenCalledTimes(1);
    playback.stopOutput();
    expect(audio.muted).toBe(true);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    playback.resumeOutput();
    expect(audio.muted).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('reports autoplay refusal and retries on explicit resume', async () => {
    const { audio, blocked, playback } = setup();
    audio.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    playback.attach({} as MediaStream);
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledTimes(1);
    playback.resumeOutput();
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('ignores late playback failure after disposal and detaches the audio source', async () => {
    const { audio, blocked, playback } = setup();
    let reject!: (error: Error) => void;
    audio.play.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    playback.attach({} as MediaStream);
    playback.dispose();
    reject(new Error('late'));
    await Promise.resolve();
    playback.resumeOutput();
    expect(blocked).not.toHaveBeenCalled();
    expect(audio.srcObject).toBeNull();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('reports real playback status only after play() resolves, and clears it on a pause', async () => {
    const audio = { srcObject: null, muted: false, play: vi.fn(), pause: vi.fn() };
    let resolvePlay!: () => void;
    audio.play.mockReturnValue(new Promise<void>(resolve => { resolvePlay = resolve; }));
    const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, vi.fn());
    const statuses: string[] = [];
    playback.observe!(event => { if (event.type === 'status') statuses.push(event.status); });

    const stream = { getTracks: () => [] } as unknown as MediaStream;
    playback.attach(stream);
    // Not audible until the browser confirms the element is actually playing.
    expect(statuses).not.toContain('playing');
    resolvePlay();
    await Promise.resolve();
    expect(statuses[statuses.length - 1]).toBe('playing');

    playback.stopOutput();
    expect(statuses[statuses.length - 1]).toBe('paused');
  });

  it('a play() that resolves after an interrupt never claims to be playing', async () => {
    const audio = { srcObject: null, muted: false, play: vi.fn(), pause: vi.fn() };
    let resolvePlay!: () => void;
    audio.play.mockReturnValue(new Promise<void>(resolve => { resolvePlay = resolve; }));
    const blocked = vi.fn();
    const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, blocked);
    const statuses: string[] = [];
    playback.observe!(event => { if (event.type === 'status') statuses.push(event.status); });

    playback.attach({ getTracks: () => [] } as unknown as MediaStream);
    playback.stopOutput();
    resolvePlay();
    await Promise.resolve();
    expect(statuses).not.toContain('playing');
    expect(statuses[statuses.length - 1]).toBe('paused');
    expect(blocked).not.toHaveBeenCalled();
  });

  it('announces the remote stream on attach/replacement and stops after unsubscribe', () => {
    const { playback } = setup();
    const seen: Array<unknown> = [];
    const unsubscribe = playback.observe!(event => { if (event.type === 'stream') seen.push(event.stream); });
    const first = { getTracks: () => [] } as unknown as MediaStream;
    const second = { getTracks: () => [] } as unknown as MediaStream;
    playback.attach(first);
    playback.attach(second);
    expect(seen).toEqual([first, second]);
    unsubscribe();
    playback.attach({ getTracks: () => [] } as unknown as MediaStream);
    expect(seen).toEqual([first, second]);
  });

  /** Audio element whose `play()` promises the test resolves/rejects manually, per call. */
  function controllable() {
    const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    const audio = { srcObject: null, muted: false, play: vi.fn(), pause: vi.fn() };
    audio.play.mockImplementation(() => new Promise<void>((resolve, reject) => { pending.push({ resolve, reject }); }));
    return { audio, pending };
  }

  it('a replacement stream does not inherit playing while its own play() is pending', async () => {
    const { audio, pending } = controllable();
    const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, vi.fn());
    const statuses: string[] = [];
    playback.observe!(event => { if (event.type === 'status') statuses.push(event.status); });

    playback.attach({ getTracks: () => [] } as unknown as MediaStream);
    pending[0].resolve();
    await Promise.resolve();
    expect(statuses[statuses.length - 1]).toBe('playing');

    // Replacing while playing must invalidate audibility BEFORE the new play() resolves.
    playback.attach({ getTracks: () => [] } as unknown as MediaStream);
    expect(statuses[statuses.length - 1]).toBe('paused');
    expect(statuses.filter(status => status === 'playing')).toHaveLength(1);

    pending[1].resolve();
    await Promise.resolve();
    expect(statuses[statuses.length - 1]).toBe('playing');
  });

  it('a late success of a replaced play() cannot claim the current replacement is playing', async () => {
    const { audio, pending } = controllable();
    const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, vi.fn());
    const statuses: string[] = [];
    playback.observe!(event => { if (event.type === 'status') statuses.push(event.status); });

    playback.attach({ getTracks: () => [] } as unknown as MediaStream);
    playback.attach({ getTracks: () => [] } as unknown as MediaStream);
    // The OLD, replaced play resolves late: it must not publish `playing` for the new stream.
    pending[0].resolve();
    await Promise.resolve();
    expect(statuses).not.toContain('playing');

    pending[1].resolve();
    await Promise.resolve();
    expect(statuses[statuses.length - 1]).toBe('playing');
  });

  it('a refused replacement reports blocked and a late old failure is inert', async () => {
    const { audio, pending } = controllable();
    const blocked = vi.fn();
    const playback = createBrowserLivePlayback(audio as unknown as HTMLAudioElement, blocked);
    const statuses: string[] = [];
    playback.observe!(event => { if (event.type === 'status') statuses.push(event.status); });

    playback.attach({ getTracks: () => [] } as unknown as MediaStream);
    playback.attach({ getTracks: () => [] } as unknown as MediaStream);

    // The replaced (old) play() failing late must not surface as a current autoplay refusal.
    pending[0].reject(new Error('late old failure'));
    await Promise.resolve();
    expect(blocked).not.toHaveBeenCalled();
    expect(statuses).not.toContain('playing');

    // The CURRENT replacement being refused is the only thing that reports blocked.
    pending[1].reject(new Error('NotAllowedError'));
    await Promise.resolve();
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(statuses[statuses.length - 1]).toBe('blocked');
    expect(statuses).not.toContain('playing');
  });
});

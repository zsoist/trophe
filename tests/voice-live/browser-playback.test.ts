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
});

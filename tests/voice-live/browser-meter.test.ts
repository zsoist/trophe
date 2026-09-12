/**
 * Real WebAudio meter seam: the analyser must tap the stream only, must degrade to `null`
 * (never a fabricated wave) when the browser cannot provide one, and must release the
 * AudioContext + RAF on detach. Covers both the microphone and the remote output meter,
 * which share one implementation.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserInputMeter, createBrowserOutputMeter } from '../../lib/voice-live/browser-session';
import type { LiveMediaStream } from '../../lib/voice-live/client-types';

const stream = { getTracks: () => [] } as unknown as LiveMediaStream;

afterEach(() => {
  vi.unstubAllGlobals();
});

function installAudio() {
  const analyser = {
    fftSize: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData(buffer: Float32Array) { buffer.fill(0.5); },
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    destination: { connect: vi.fn() },
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  class FakeAudioContext {
    destination = context.destination;
    createMediaStreamSource = context.createMediaStreamSource;
    createAnalyser = context.createAnalyser;
    resume = context.resume;
    close = context.close;
  }
  class FakeAnalyserNode {}
  let frame: (() => void) | null = null;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AnalyserNode', FakeAnalyserNode);
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frame = cb; return 7; });
  const cancel = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return { analyser, source, context, cancel, runFrame: () => frame?.() };
}

it('measures real RMS from the stream without routing the analyser to an audible output', () => {
  const { analyser, source, context, cancel, runFrame } = installAudio();
  const levels: Array<number | null> = [];
  const detach = createBrowserInputMeter().attach(stream, level => levels.push(level));
  expect(typeof detach).toBe('function');
  expect(source.connect).toHaveBeenCalledWith(analyser);
  // The analyser is never connected onward: no second audible path, no echo/feedback loop.
  expect(analyser.connect).not.toHaveBeenCalled();
  expect(context.destination.connect).not.toHaveBeenCalled();
  expect(levels).toEqual([]);
  runFrame();
  expect(levels).toEqual([0.5]);
  detach?.();
  expect(cancel).toHaveBeenCalledWith(7);
  expect(source.disconnect).toHaveBeenCalledTimes(1);
  expect(context.close).toHaveBeenCalledTimes(1);
});

it('shares the same real meter for the remote output stream', () => {
  installAudio();
  const levels: Array<number | null> = [];
  const detach = createBrowserOutputMeter().attach(stream, level => levels.push(level));
  expect(typeof detach).toBe('function');
  detach?.();
});

it('returns null (never a fabricated wave) when WebAudio is unavailable', () => {
  vi.stubGlobal('AudioContext', undefined);
  vi.stubGlobal('AnalyserNode', undefined);
  expect(createBrowserOutputMeter().attach(stream, () => {})).toBeNull();
});

it('returns null when the AudioContext cannot be constructed', () => {
  class ThrowingContext {
    constructor() {
      throw new Error('no audio hardware');
    }
  }
  vi.stubGlobal('AudioContext', ThrowingContext);
  vi.stubGlobal('AnalyserNode', class {});
  expect(createBrowserInputMeter().attach(stream, () => {})).toBeNull();
});

it('returns null and releases the context when the stream source cannot be created', () => {
  const close = vi.fn(() => Promise.resolve());
  class FailingContext {
    destination = { connect: vi.fn() };
    close = close;
    resume = vi.fn(() => Promise.resolve());
    createMediaStreamSource() {
      throw new Error('bad stream');
    }
    createAnalyser() {
      throw new Error('unreachable');
    }
  }
  vi.stubGlobal('AudioContext', FailingContext);
  vi.stubGlobal('AnalyserNode', class {});
  expect(createBrowserInputMeter().attach(stream, () => {})).toBeNull();
  expect(close).toHaveBeenCalledTimes(1);
});

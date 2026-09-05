// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseMotion } from '@/components/workout/ExerciseMotion';
import type { ExerciseMediaRecord } from '@/lib/workout/exercise-media';

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      lang: 'en',
      t: (key: string) => actual.translations[key]?.en ?? key,
    }),
  };
});

const benchMedia: ExerciseMediaRecord = {
  slug: 'bench-press',
  canonicalNames: ['Barbell Bench Press'],
  equipment: ['Barbell'],
  posterSrc: '/workout-v2/exercises/bench-press.webp',
  motionSrc: '/workout-v2/motion/bench-press.webm',
  motionType: 'video/webm',
  tier: 'verified-technique',
  activations: [],
  phases: [],
  provenance: { kind: 'repo-vector', source: 'test', reviewedOn: '2026-09-02' },
};

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ExerciseMotion', () => {
  it('provides a visible pause control for autoplay and pauses the video', async () => {
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay />);

    fireEvent.click(screen.getByRole('button', { name: /pause demonstration/i }));

    await waitFor(() => expect(pause).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /play demonstration/i })).toBeTruthy();
  });

  it('preserves autoplay intent but pauses and disables playback while the live session is paused', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const view = render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay playbackDisabled />);

    await waitFor(() => expect(pause).toHaveBeenCalled());
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Resume workout to play demonstration' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Workout paused. Demonstration paused.')).toBeTruthy();

    view.rerender(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay playbackDisabled={false} />);
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
  });

  it('uses only the poster and never starts autoplay when reduced motion is requested', () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const serverMarkup = renderToString(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" />);
    expect(serverMarkup).not.toContain('data-testid="exercise-motion-video"');

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    expect(vi.mocked(window.matchMedia)).not.toHaveBeenCalled();

    render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay />);

    return waitFor(() => {
      expect(screen.getByRole('img', { name: 'Bench press demonstration' }).getAttribute('src')).toBe(benchMedia.posterSrc);
      expect(screen.queryByTestId('exercise-motion-video')).toBeNull();
      expect(play).not.toHaveBeenCalled();
    });
  });

  it.each([
    { name: 'a missing source', media: { ...benchMedia, motionSrc: undefined } },
    { name: 'a non-technique tier', media: { ...benchMedia, tier: 'verified-anatomy' as const } },
  ])('renders an honest poster without technique controls for $name', ({ media }) => {
    render(<ExerciseMotion media={media} alt="Bench press demonstration" autoplay />);

    expect(screen.getByRole('img', { name: 'Bench press demonstration' }).getAttribute('src')).toBe(benchMedia.posterSrc);
    expect(screen.queryByTestId('exercise-motion-video')).toBeNull();
    expect(screen.queryByRole('button', { name: /demonstration/i })).toBeNull();
  });

  it('pauses an exact demonstration when it leaves the viewport or the document is hidden', async () => {
    let notify: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) { notify = callback; }
      disconnect() {}
      observe() {}
    });
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay />);

    notify?.([{ isIntersecting: false }]);
    await waitFor(() => expect(pause).toHaveBeenCalled());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(pause).toHaveBeenCalledTimes(2));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
});

it('falls back to the poster after a source error and permits an explicit retry', async () => {
  render(<ExerciseMotion media={benchMedia} alt="Synthetic demonstration" autoplay />);
  fireEvent.error(screen.getByTestId('exercise-motion-video'));
  expect(screen.getByRole('img', { name: 'Synthetic demonstration' }).getAttribute('src')).toBe(benchMedia.posterSrc);
  expect(screen.queryByTestId('exercise-motion-video')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /play demonstration/i }));
  await waitFor(() => expect(screen.getByTestId('exercise-motion-video')).toBeTruthy());
});

it('replaces the video element on exercise change and pauses it on unmount', async () => {
  const view = render(<ExerciseMotion media={benchMedia} alt="Synthetic demonstration" autoplay />);
  const oldVideo = screen.getByTestId('exercise-motion-video');
  view.rerender(<ExerciseMotion media={{ ...benchMedia, slug: 'curl', motionSrc: '/synthetic-curl.mp4', motionType: 'video/mp4' }} alt="Synthetic curl" autoplay />);
  expect(screen.getByTestId('exercise-motion-video')).not.toBe(oldVideo);
  const pause = vi.mocked(HTMLMediaElement.prototype.pause); pause.mockClear(); view.unmount();
  expect(pause).toHaveBeenCalled();
});

it('does not request metadata before playback and pauses on window blur', async () => {
  render(<ExerciseMotion media={benchMedia} alt="Synthetic demonstration" autoplay />);
  expect(screen.getByTestId('exercise-motion-video').getAttribute('preload')).toBe('none');
  const pause = vi.mocked(HTMLMediaElement.prototype.pause); pause.mockClear();
  fireEvent(window, new Event('blur'));
  await waitFor(() => expect(pause).toHaveBeenCalled());
});

it('shows localized phases from actual video time without changing workout state', () => {
  render(<ExerciseMotion media={{ ...benchMedia, timedPhases: [{ id: 'setup', startSeconds: 0, endSeconds: 1, labelKey: 'workout.detail_phase_setup' }, { id: 'work', startSeconds: 1, endSeconds: 4, labelKey: 'workout.detail_phase_work' }] }} alt="Synthetic demonstration" />);
  const video = screen.getByTestId('exercise-motion-video') as HTMLVideoElement;
  video.currentTime = 2; fireEvent.timeUpdate(video);
  expect(screen.getByText('Work')).toBeTruthy();
});

it('observes the replacement video after a source error and retry', async () => {
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class { disconnect() {} observe(element: Element) { observe(element); } });
  render(<ExerciseMotion media={benchMedia} alt="Synthetic demonstration" autoplay />);
  const first = screen.getByTestId('exercise-motion-video');
  fireEvent.error(first); fireEvent.click(screen.getByRole('button', { name: /play demonstration/i }));
  const replacement = screen.getByTestId('exercise-motion-video');
  expect(replacement).not.toBe(first); await waitFor(() => expect(observe).toHaveBeenCalledWith(replacement));
});

it('offers mobile WebM and does not discard the HD fallback when the mobile source fails', () => {
  render(<ExerciseMotion media={{ ...benchMedia, motionType: 'video/mp4', motionSrc: '/synthetic/hd.mp4', mobileMotionSrc: '/synthetic/mobile.webm', mobileMotionType: 'video/webm' }} alt="Synthetic demonstration" />);
  const video = screen.getByTestId('exercise-motion-video'); const sources = video.querySelectorAll('source');
  expect(sources).toHaveLength(2); expect(sources[0].getAttribute('media')).toBe('(max-width: 720px)');
  fireEvent.error(sources[0]); expect(screen.getByTestId('exercise-motion-video')).toBe(video);
  fireEvent.error(sources[1]); expect(screen.queryByTestId('exercise-motion-video')).toBeNull();
});


it('does not autoplay when mounted or replaced in an already blurred window', async () => {
  vi.mocked(document.hasFocus).mockReturnValue(false);
  const play = vi.mocked(HTMLMediaElement.prototype.play);
  const view = render(<ExerciseMotion media={benchMedia} alt="First exercise" autoplay />);
  await waitFor(() => expect(screen.getByTestId('exercise-motion-video')).toBeTruthy());
  expect(play).not.toHaveBeenCalled();
  view.rerender(<ExerciseMotion media={{ ...benchMedia, slug: 'replacement', motionSrc: '/workout-v2/motion/replacement.webm' }} alt="Replacement" autoplay />);
  expect(play).not.toHaveBeenCalled();
  vi.mocked(document.hasFocus).mockReturnValue(true);
  fireEvent.focus(window);
  await waitFor(() => expect(play).toHaveBeenCalledOnce());
});

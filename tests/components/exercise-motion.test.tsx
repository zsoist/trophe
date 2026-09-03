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

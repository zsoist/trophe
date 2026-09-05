// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PrivateReview, type ReviewRecord } from '../../scripts/media/private-review';
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, setLang: vi.fn() }) }));
const record: ReviewRecord = { releaseId: 'test', buildKey: 'b'.repeat(64), manifestSha256: 'c'.repeat(64), videoSha256: 'a'.repeat(64), releaseStatus: 'candidate', label: 'Before', duration: 4, media: { slug: 'curl', canonicalNames: ['Curl'], equipment: ['Dumbbell'], posterSrc: '/poster.webp', motionSrc: '/motion.mp4', motionType: 'video/mp4', tier: 'candidate-preview', activations: [], phases: [], provenance: { kind: 'sourced', source: 'synthetic', reviewedOn: '' } } };
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('starts paused, controls slow motion, and pauses an approximate seek outside the video', () => {
  render(<PrivateReview records={[record]} diagnostics={[]} />);
  const video = screen.getByTestId('exercise-motion-video') as HTMLVideoElement;
  expect(video.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Play review' }));
  expect(video.play).toHaveBeenCalled();
  fireEvent.loadedMetadata(video);
  fireEvent.change(screen.getByLabelText('Review speed'), { target: { value: '0.25' } }); expect(video.playbackRate).toBe(0.25);
  fireEvent.change(screen.getByLabelText('Approximate clip time'), { target: { value: '2' } }); expect(video.currentTime).toBe(2); expect(video.pause).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Play review' })).toBeTruthy();
  expect(screen.getByLabelText('Private review controls').closest('.review-viewport')).toBeNull();
});
it('keeps reduced motion as poster and does not play', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  render(<PrivateReview records={[record]} diagnostics={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Play review' }));
  expect(screen.queryByTestId('exercise-motion-video')).toBeNull(); expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(screen.getByRole('img')).toBeTruthy();
});
it('resets magnification without changing source or identity', () => {
  render(<PrivateReview records={[record]} diagnostics={[]} />);
  fireEvent.change(screen.getByLabelText('Review zoom'), { target: { value: '3' } }); expect(document.querySelector('.review-scale-3')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' })); expect(document.querySelector('.review-scale-1')).toBeTruthy();
  expect(screen.getByText(record.videoSha256!)).toBeTruthy();
});

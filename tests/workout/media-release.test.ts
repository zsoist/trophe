import { describe, expect, it } from 'vitest';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';
import { applyVideoRelease, type VideoReleaseAsset } from '@/lib/workout/media-release';
const base = resolveExerciseMedia({ name: 'Dumbbell Curl', equipment: 'Dumbbell' });
const key = 'a'.repeat(64);
const asset: VideoReleaseAsset = { slug: 'curl', buildKey: key, equipment: 'Dumbbell', posterSrc: `/workout-v4/${key}/assets/curl/poster.webp`, motionSrc: `/workout-v4/${key}/assets/curl/motion.mp4`, motionType: 'video/mp4', artifactSetSha256: 'b'.repeat(64), reviewedOn: '2026-09-05T00:00:00Z', phases: [{ id: 'work', startSeconds: 0, endSeconds: 4, labelKey: 'workout.detail_phase_work' }] };
it('keeps the previous release when the feature is disabled', () => expect(applyVideoRelease(base, [asset], false)).toBe(base));
it('selects MP4/poster and timed phases only for an exact approved identity', () => expect(applyVideoRelease(base, [asset], true)).toMatchObject({ motionSrc: asset.motionSrc, motionType: 'video/mp4', timedPhases: asset.phases }));
describe('video release fails closed', () => {
  it.each([{ ...asset, equipment: 'Barbell' }, { ...asset, slug: 'bench-press' }, { ...asset, motionSrc: 'https://foreign.invalid/video.mp4' }, { ...asset, motionSrc: `/workout-v4/${key}/../evil.mp4` }])('rejects incompatible or external media', candidate => expect(applyVideoRelease(base, [candidate], true)).toBe(base));
  it('does not upgrade a fallback into a technique claim', () => expect(applyVideoRelease({ ...base, tier: 'group-estimate' }, [asset], true).tier).toBe('group-estimate'));
});
it('carries optional mobile WebM only under the same immutable build path', () => {
  const candidate = { ...asset, mobileSrc: `/workout-v4/${key}/assets/curl/mobile.webm`, mobileType: 'video/webm' as const };
  expect(applyVideoRelease(base, [candidate], true)).toMatchObject({ mobileMotionSrc: candidate.mobileSrc, mobileMotionType: 'video/webm' });
  expect(applyVideoRelease(base, [{ ...candidate, mobileSrc: 'https://foreign.invalid/mobile.webm' }], true)).toBe(base);
});
it('accepts safe nested derivative paths that intake and staging preserve', () => {
  const nested = { ...asset, motionSrc: `/workout-v4/${key}/assets/curl/video/motion.mp4` };
  expect(applyVideoRelease(base, [nested], true).motionSrc).toBe(nested.motionSrc);
});

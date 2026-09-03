import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assertDecodedMotion, assertFileSha256, sha256File } from '../../scripts/visual/workout-v3-media-validation.mjs';

const repoRoot = process.cwd();
const manifestPath = join(repoRoot, 'public', 'workout-v3', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  version: 1;
  assets: Record<string, {
    source: { path: string; width: number; height: number; sha256: string };
    master: { path: string; width: number; height: number; sha256: string; resampling: 'native' | 'deterministic-upscale' };
    poster: { src: string; width: number; height: number; byteBudget: number; sha256: string; objectPosition: string };
    motion: { src: string; durationSeconds: number; frameRate: number; byteBudget: number; sha256: string; phases: string[] };
    provenance: { promptOrOrigin: string; sourcePath: string; generatedWith: 'built-in-image-gen' };
    review: { exerciseIdentity: boolean; equipmentIdentity: boolean; setupPhase: boolean; workPhase: boolean; finishPhase: boolean };
    safeMarginPct: number;
  }>;
};

const requiredTechniqueSlugs = [
  'bench-press', 'incline-press', 'smith-bench-press', 'machine-chest-press', 'floor-press', 'pec-deck', 'cable-fly', 'push-up',
  'dip', 'pull-up', 'row', 'overhead-press', 'curl', 'triceps-extension', 'squat', 'deadlift',
] as const;

describe('workout V3 verified media cohort', () => {
  it.each(requiredTechniqueSlugs)('%s has a 4K master, poster, motion loop, and provenance', async (slug) => {
    const item = manifest.assets[slug];
    expect(item.master.width * item.master.height).toBeGreaterThanOrEqual(8_000_000);
    expect(item.master.path).toMatch(/^assets\/workout-v3\/masters\/.+\.webp$/);
    expect(item.poster.src).toMatch(/^\/workout-v3\/posters\/.+\.webp$/);
    expect(item.motion.src).toMatch(/^\/workout-v3\/motion\/.+\.webm$/);
    expect(item.provenance.promptOrOrigin).not.toHaveLength(0);
    expect(item.provenance.generatedWith).toBe('built-in-image-gen');
    expect(item.review.exerciseIdentity).toBe(true);
    expect(item.review.equipmentIdentity).toBe(true);
    expect(item.review.setupPhase).toBe(true);
    expect(item.review.workPhase).toBe(true);
    expect(item.review.finishPhase).toBe(true);
    expect(item.safeMarginPct).toBeGreaterThanOrEqual(10);
    const sourcePath = join(repoRoot, item.source.path);
    const masterPath = join(repoRoot, item.master.path);
    const posterPath = join(repoRoot, 'public', item.poster.src);
    const motionPath = join(repoRoot, 'public', item.motion.src);
    expect(statSync(masterPath).isFile()).toBe(true);
    expect(statSync(posterPath).size).toBeLessThanOrEqual(item.poster.byteBudget);
    expect(statSync(motionPath).size).toBeLessThanOrEqual(item.motion.byteBudget);
    expect(sha256File(sourcePath)).toBe(item.source.sha256);
    expect(sha256File(masterPath)).toBe(item.master.sha256);
    expect(sha256File(posterPath)).toBe(item.poster.sha256);
    expect(sha256File(motionPath)).toBe(item.motion.sha256);
    const sourceMeta = await sharp(sourcePath).metadata();
    const masterMeta = await sharp(masterPath).metadata();
    expect(sourceMeta.width).toBe(item.source.width);
    expect(sourceMeta.height).toBe(item.source.height);
    expect(masterMeta.width).toBe(item.master.width);
    expect(masterMeta.height).toBe(item.master.height);
    expect(item.master.resampling).toBe('deterministic-upscale');
    expect([sourceMeta.width, sourceMeta.height]).not.toEqual([masterMeta.width, masterMeta.height]);
    expect(assertDecodedMotion(motionPath, { width: 960, height: 540, frameRate: 2, durationSeconds: 2 }).decodedFrameHashes).toHaveLength(4);
  });

  it('rejects decoder and SHA contract mutations in isolated temporary media fixtures', () => {
    const item = manifest.assets['bench-press'];
    const fixtureDir = mkdtempSync(join(tmpdir(), 'trophe-v3-motion-fixture-'));
    const posterPath = join(repoRoot, 'public', item.poster.src);
    const repeated = join(fixtureDir, 'repeated.webm');
    const wrongCodec = join(fixtureDir, 'wrong-codec.webm');
    const wrongSize = join(fixtureDir, 'wrong-size.webm');
    const corrupt = join(fixtureDir, 'corrupt.webm');
    const expected = { width: 960, height: 540, frameRate: 2, durationSeconds: 2 };

    try {
      execFileSync('ffmpeg', [
        '-y', '-loop', '1', '-framerate', '2', '-i', posterPath, '-frames:v', '4',
        '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-crf', '0', '-pix_fmt', 'yuv420p', repeated,
      ], { stdio: 'pipe' });
      execFileSync('ffmpeg', ['-y', '-loop', '1', '-framerate', '2', '-i', posterPath, '-frames:v', '4', '-an', '-c:v', 'libvpx', '-pix_fmt', 'yuv420p', wrongCodec], { stdio: 'pipe' });
      execFileSync('ffmpeg', ['-y', '-loop', '1', '-framerate', '2', '-i', posterPath, '-vf', 'scale=320:180', '-frames:v', '4', '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-crf', '0', '-pix_fmt', 'yuv420p', wrongSize], { stdio: 'pipe' });
      writeFileSync(corrupt, 'not a WebM');

      expect(() => assertDecodedMotion(repeated, expected)).toThrow(/pairwise distinct/i);
      expect(() => assertDecodedMotion(wrongCodec, expected)).toThrow(/VP9/i);
      expect(() => assertDecodedMotion(wrongSize, expected)).toThrow(/960x540/i);
      expect(() => assertDecodedMotion(corrupt, expected)).toThrow(/motion probe failed/i);
      expect(() => assertFileSha256(repeated, item.motion.sha256, 'repeated fixture')).toThrow(/SHA-256 mismatch/i);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});

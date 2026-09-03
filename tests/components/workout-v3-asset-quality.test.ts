import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const manifestPath = join(repoRoot, 'public', 'workout-v3', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  version: 1;
  assets: Record<string, {
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
    expect(statSync(join(repoRoot, item.master.path)).isFile()).toBe(true);
    expect(statSync(join(repoRoot, 'public', item.poster.src)).size).toBeLessThanOrEqual(item.poster.byteBudget);
    expect(statSync(join(repoRoot, 'public', item.motion.src)).size).toBeLessThanOrEqual(item.motion.byteBudget);
    expect((await sharp(join(repoRoot, item.master.path)).metadata()).width).toBe(item.master.width);
  });
});

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { resolveWorkoutAsset, type BodyAreaId } from '@/lib/workout-assets';

const repoRoot = process.cwd();
const manifestPath = join(repoRoot, 'public', 'workout-v2', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  assets: Record<string, {
    kind: 'anatomy' | 'technique' | 'cardio';
    src: `/${string}`;
    source: { path: `assets/${string}`; width: number; height: number; sha256: string; safeMarginPct: number };
    master: { path: `assets/${string}`; width: number; height: number; upscaled: boolean; sha256: string; canvasPaddingPct: number };
    display: { width: number; height: number; sha256: string; hasAlpha: true };
    safeMarginPct: number;
    fallbackLabel: 'anatomy';
  }>;
};

const anatomy = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full-body', 'cardio'];
const technique = [
  'bench-press', 'incline-press', 'overhead-press', 'pec-deck', 'cable-fly', 'pull-up',
  'deadlift', 'squat', 'dip', 'row', 'curl', 'triceps-extension',
];

describe('workout V2 asset quality', () => {
  it.each([...anatomy, ...technique])('%s has an honest high-resolution master and optimized derivative', async (slug) => {
    const entry = manifest.assets[slug];
    expect(entry).toBeDefined();
    expect(entry.kind).toMatch(/^(anatomy|technique|cardio)$/);
    expect(entry.source.width).toBeGreaterThanOrEqual(1024);
    expect(entry.source.height).toBeGreaterThanOrEqual(1024);
    expect(entry.source.path).toMatch(/^assets\/workout-v2\/sources\//);
    expect(entry.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.source.safeMarginPct).toBeGreaterThanOrEqual(0);
    expect(Math.max(entry.master.width, entry.master.height)).toBeGreaterThanOrEqual(3240);
    expect(entry.master.upscaled).toBe(true);
    expect(entry.master.path).toMatch(/^assets\/workout-v2\/masters\//);
    expect(entry.master.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.master.canvasPaddingPct).toBeGreaterThanOrEqual(10);
    expect(entry.display.hasAlpha).toBe(true);
    expect(entry.display.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.safeMarginPct).toBeGreaterThanOrEqual(8);
    expect(entry.fallbackLabel).toBe('anatomy');
    const displayPath = join(repoRoot, 'public', entry.src.slice(1));
    expect(statSync(displayPath).size).toBeLessThan(450_000);
    expect(statSync(join(repoRoot, entry.source.path)).isFile()).toBe(true);
    expect(statSync(join(repoRoot, entry.master.path)).isFile()).toBe(true);
    const metadata = await sharp(displayPath).metadata();
    expect(metadata.hasAlpha).toBe(true);
    const { data, info } = await sharp(displayPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width; let top = info.height; let right = -1; let bottom = -1; let opaquePixels = 0;
    for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] > 24) {
        opaquePixels += 1;
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    expect(right).toBeGreaterThanOrEqual(left);
    expect(opaquePixels).toBeGreaterThan(info.width * info.height * 0.01);
    expect(Math.min(left / info.width, (info.width - 1 - right) / info.width, top / info.height, (info.height - 1 - bottom) / info.height) * 100).toBeGreaterThanOrEqual(8);
  });

  it('keeps deploy-public workout payload below 2 MiB', () => {
    const total = Object.values(manifest.assets).reduce((bytes, entry) => bytes + statSync(join(repoRoot, 'public', entry.src.slice(1))).size, statSync(manifestPath).size);
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });

  it('keeps source and master assets out of the deploy payload', () => {
    expect(readFileSync(join(repoRoot, '.vercelignore'), 'utf8')).toContain('assets/workout-v2');
    expect(() => statSync(join(repoRoot, 'public', 'workout-v2', 'masters'))).toThrow();
  });

  it.each(anatomy)('provides a contained anatomy fallback for %s', (area) => {
    const asset = resolveWorkoutAsset({ bodyArea: area as BodyAreaId });
    expect(asset).toEqual(expect.objectContaining({
      src: `/workout-v2/body-areas/${area}.webp`,
      kind: area === 'cardio' ? 'cardio' : 'anatomy',
      fit: 'contain',
    }));
  });

  it.each(technique)('resolves the exact %s technique asset', (slug) => {
    const exerciseName = {
      'bench-press': 'Barbell Bench Press', 'incline-press': 'Incline Dumbbell Press',
      'overhead-press': 'Standing Overhead Barbell Press', 'pec-deck': 'Pec Deck Machine',
      'cable-fly': 'Standing Cable Chest Fly', 'pull-up': 'Pull-Up',
      deadlift: 'Conventional Barbell Deadlift', squat: 'Barbell Back Squat', dip: 'Chest Dip',
      row: 'Seated Cable Row', curl: 'Standing Dumbbell Biceps Curl',
      'triceps-extension': 'Cable Rope Triceps Extension',
    }[slug];
    expect(resolveWorkoutAsset({ exerciseName })).toEqual(expect.objectContaining({
      src: `/workout-v2/exercises/${slug}.webp`, kind: 'technique', fit: 'contain',
    }));
  });
});

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { resolveWorkoutAsset, type BodyAreaId } from '@/lib/workout-assets';

const repoRoot = process.cwd();
const manifestPath = join(repoRoot, 'public', 'workout-v2', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  version: number;
  sourceContract: string;
  assets: Record<string, {
    kind: 'anatomy' | 'technique' | 'cardio';
    src: `/${string}`;
    source: {
      path: `assets/${string}`;
      type: 'vector';
      format: 'svg';
      scalable: true;
      width: number;
      height: number;
      sha256: string;
      safeMarginPct: number;
      subjectSafeMarginPct: number;
    };
    master: {
      path: `assets/${string}`;
      width: number;
      height: number;
      upscaled: boolean;
      sha256: string;
      canvasPaddingPct: number;
      hasAlpha: boolean;
      safeMarginPct: number;
      subjectSafeMarginPct: number;
    };
    display: { width: number; height: number; sha256: string; hasAlpha: boolean; safeMarginPct: number; subjectSafeMarginPct: number };
    safeMarginPct: number;
    generatorMode: 'repo-native-svg';
    background: 'warm-neutral-vector-plate';
    semanticMuscles: string[];
    fallbackLabel: 'anatomy';
  }>;
};

const anatomy = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full-body', 'cardio'];
const technique = [
  'bench-press', 'smith-bench-press', 'floor-press', 'machine-chest-press', 'push-up',
  'incline-press', 'overhead-press', 'pec-deck', 'cable-fly', 'pull-up',
  'deadlift', 'squat', 'dip', 'row', 'curl', 'triceps-extension',
];

describe('workout V2 asset quality', () => {
  it('uses the deterministic native-vector 4K source contract', () => {
    expect(manifest.version).toBe(3);
    expect(manifest.sourceContract).toBe('native-vector-4k-v1');
  });

  it.each([...anatomy, ...technique])('%s has an honest resolution-independent source, true 4K master, and optimized derivative', async (slug) => {
    const entry = manifest.assets[slug];
    expect(entry).toBeDefined();
    expect(entry.kind).toMatch(/^(anatomy|technique|cardio)$/);
    expect(entry.source.type).toBe('vector');
    expect(entry.source.format).toBe('svg');
    expect(entry.source.scalable).toBe(true);
    expect(entry.source.path).toMatch(/^assets\/workout-v2\/sources\/.+\.svg$/);
    expect(entry.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.source.safeMarginPct).toBeGreaterThanOrEqual(10);
    expect(entry.source.subjectSafeMarginPct).toBeGreaterThanOrEqual(10);
    const expectedDimensions = entry.kind === 'technique'
      ? { width: 3840, height: 2160, displayWidth: 960, displayHeight: 540 }
      : { width: 2160, height: 3840, displayWidth: 540, displayHeight: 960 };
    expect(entry.source.width).toBe(expectedDimensions.width);
    expect(entry.source.height).toBe(expectedDimensions.height);
    expect(entry.master.width).toBe(expectedDimensions.width);
    expect(entry.master.height).toBe(expectedDimensions.height);
    expect(entry.master.upscaled).toBe(false);
    expect(entry.master.path).toMatch(/^assets\/workout-v2\/masters\//);
    expect(entry.master.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.master.canvasPaddingPct).toBe(10);
    expect(entry.master.hasAlpha).toBe(true);
    expect(entry.master.safeMarginPct).toBeGreaterThanOrEqual(9.5);
    expect(entry.master.subjectSafeMarginPct).toBeGreaterThanOrEqual(10);
    expect(entry.display.width).toBe(expectedDimensions.displayWidth);
    expect(entry.display.height).toBe(expectedDimensions.displayHeight);
    expect(entry.display.hasAlpha).toBe(true);
    expect(entry.display.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.display.safeMarginPct).toBeGreaterThanOrEqual(9.5);
    expect(entry.display.subjectSafeMarginPct).toBeGreaterThanOrEqual(10);
    expect(entry.safeMarginPct).toBeGreaterThanOrEqual(9.5);
    expect(entry.generatorMode).toBe('repo-native-svg');
    expect(entry.background).toBe('warm-neutral-vector-plate');
    expect(entry.semanticMuscles.length).toBeGreaterThan(0);
    expect(entry.fallbackLabel).toBe('anatomy');
    const displayPath = join(repoRoot, 'public', entry.src.slice(1));
    expect(statSync(displayPath).size).toBeLessThan(450_000);
    expect(statSync(join(repoRoot, entry.source.path)).isFile()).toBe(true);
    expect(statSync(join(repoRoot, entry.master.path)).isFile()).toBe(true);
    const svg = readFileSync(join(repoRoot, entry.source.path), 'utf8');
    expect(svg).toContain('data-generator="repo-native-vector"');
    expect(svg).toContain(`width="${expectedDimensions.width}"`);
    expect(svg).toContain(`height="${expectedDimensions.height}"`);
    expect(svg).not.toMatch(/<(?:image|text)\b/i);
    expect(svg).not.toMatch(/(?:href|src)\s*=|data:image|base64,/i);
    const masterPath = join(repoRoot, entry.master.path);
    const masterMetadata = await sharp(masterPath).metadata();
    expect(masterMetadata.hasAlpha).toBe(true);
    const masterRaw = await sharp(masterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let masterLeft = masterRaw.info.width; let masterTop = masterRaw.info.height; let masterRight = -1; let masterBottom = -1;
    for (let y = 0; y < masterRaw.info.height; y += 1) for (let x = 0; x < masterRaw.info.width; x += 1) {
      if (masterRaw.data[(y * masterRaw.info.width + x) * masterRaw.info.channels + 3] > 24) {
        masterLeft = Math.min(masterLeft, x); masterRight = Math.max(masterRight, x);
        masterTop = Math.min(masterTop, y); masterBottom = Math.max(masterBottom, y);
      }
    }
    expect(masterRight).toBeGreaterThanOrEqual(masterLeft);
    const masterMeasuredMarginPct = Math.min(
      masterLeft / masterRaw.info.width,
      (masterRaw.info.width - 1 - masterRight) / masterRaw.info.width,
      masterTop / masterRaw.info.height,
      (masterRaw.info.height - 1 - masterBottom) / masterRaw.info.height,
    ) * 100;
    expect(masterMeasuredMarginPct).toBeGreaterThanOrEqual(9.5);
    expect(entry.master.safeMarginPct).toBeCloseTo(masterMeasuredMarginPct, 2);
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
    expect(Math.min(left / info.width, (info.width - 1 - right) / info.width, top / info.height, (info.height - 1 - bottom) / info.height) * 100).toBeGreaterThanOrEqual(9.5);
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
      'smith-bench-press': 'Smith Machine Bench Press', 'floor-press': 'Floor Press',
      'machine-chest-press': 'Machine Chest Press', 'push-up': 'Push-Ups',
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

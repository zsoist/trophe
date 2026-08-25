import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWorkoutAsset, type BodyAreaId } from '@/lib/workout-assets';

const repoRoot = process.cwd();
const manifestPath = join(repoRoot, 'public', 'workout-v2', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  assets: Record<string, {
    kind: 'anatomy' | 'technique' | 'cardio';
    src: string;
    source: { path: string; width: number; height: number };
    master: { path: string; width: number; height: number; upscaled: boolean };
    display: { width: number; height: number };
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
  it.each([...anatomy, ...technique])('%s has an honest high-resolution master and optimized derivative', (slug) => {
    const entry = manifest.assets[slug];
    expect(entry).toBeDefined();
    expect(entry.kind).toMatch(/^(anatomy|technique|cardio)$/);
    expect(entry.source.width).toBeGreaterThanOrEqual(1024);
    expect(entry.source.height).toBeGreaterThanOrEqual(1024);
    expect(Math.max(entry.master.width, entry.master.height)).toBeGreaterThanOrEqual(3240);
    expect(entry.master.upscaled).toBe(true);
    expect(entry.safeMarginPct).toBeGreaterThanOrEqual(8);
    expect(entry.fallbackLabel).toBe('anatomy');
    expect(statSync(join(repoRoot, 'public', entry.src)).size).toBeLessThan(450_000);
    expect(statSync(join(repoRoot, 'public', entry.source.path)).isFile()).toBe(true);
    expect(statSync(join(repoRoot, 'public', entry.master.path)).isFile()).toBe(true);
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

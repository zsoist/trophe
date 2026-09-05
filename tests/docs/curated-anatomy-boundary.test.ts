import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(root: string): string[] {
  const absolute = join(process.cwd(), root);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) return sourceFiles(path.slice(process.cwd().length + 1));
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('curated anatomy boundary', () => {
  it('keeps named-muscle analytics and recommendation code off the group-estimate resolver', () => {
    const roots = [
      'components/workout/analytics',
      'components/workout/workspace/PlanMuscleSummary.tsx',
      'lib/trpc',
      'lib/workout/recommendation.ts',
    ];
    const offenders = roots.flatMap((root) => sourceFiles(root)
      .filter((file) => /\bresolveMuscleActivations\b/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(process.cwd().length + 1)));

    expect(offenders, [
      'Named analytics/recommendations must use resolveCuratedMuscleActivations; group estimates may only drive atlas presentation.',
      ...offenders,
    ].join('\n')).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return entry.isFile() && entry.name === 'page.tsx' ? [path] : [];
  });
}

function layoutAncestors(page: string, appArea: string): string[] {
  const areaRoot = join(root, 'app', appArea);
  const pageDirectory = join(page, '..');
  const relativeDirectory = relative(areaRoot, pageDirectory);
  const segments = relativeDirectory === '' ? [] : relativeDirectory.split('/');
  const candidates = [areaRoot];
  for (let index = 1; index <= segments.length; index += 1) {
    candidates.push(join(areaRoot, ...segments.slice(0, index)));
  }
  return candidates
    .map(directory => join(directory, 'layout.tsx'))
    .filter(path => statSync(path, { throwIfNoEntry: false })?.isFile());
}

describe('Coach Everywhere route coverage', () => {
  it('routes every client dashboard page through the shared coach entry', () => {
    const pages = pageFiles(join(root, 'app/dashboard'));
    const workoutPages = pages.filter(page => relative(join(root, 'app/dashboard'), page).startsWith('workout/'));
    const standardPages = pages.filter(page => !workoutPages.includes(page));
    const dashboardLayout = readFileSync(join(root, 'app/dashboard/layout.tsx'), 'utf8');
    const shell = readFileSync(join(root, 'components/shared/ClientShell.tsx'), 'utf8');
    const workoutLayout = readFileSync(join(root, 'app/dashboard/workout/layout.tsx'), 'utf8');

    expect(standardPages.length).toBeGreaterThan(0);
    expect(workoutPages.length).toBeGreaterThan(0);
    expect(dashboardLayout).toContain('<ClientShell>');
    expect(shell).toContain("!pathname.startsWith('/dashboard/workout')");
    expect(shell).toContain('<GlobalCoachEntry />');
    expect(workoutLayout).toContain('<WorkoutCoachMount />');

    for (const page of standardPages) {
      expect(layoutAncestors(page, 'dashboard')).toContain(join(root, 'app/dashboard/layout.tsx'));
    }
    for (const page of workoutPages) {
      expect(layoutAncestors(page, 'dashboard')).toContain(join(root, 'app/dashboard/layout.tsx'));
      expect(layoutAncestors(page, 'dashboard')).toContain(join(root, 'app/dashboard/workout/layout.tsx'));
    }
  });

  it('routes every professional coach page through one professional entry', () => {
    const pages = pageFiles(join(root, 'app/coach'));
    const coachLayout = readFileSync(join(root, 'app/coach/layout.tsx'), 'utf8');

    expect(pages.length).toBeGreaterThan(0);
    expect(coachLayout).toContain('<GlobalCoachEntry professional />');
    for (const page of pages) {
      expect(layoutAncestors(page, 'coach')).toContain(join(root, 'app/coach/layout.tsx'));
    }
  });
});

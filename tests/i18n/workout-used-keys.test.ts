import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n';

/**
 * Every literal translation key passed to t('...') inside the Workout module must
 * exist in the core dictionary. A missing key leaks the raw key string to users in
 * all eight locales (the runtime falls back to the key itself).
 */
const SOURCE_ROOTS = ['components/workout', 'app/dashboard/workout'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

// TODO(sibling PR): 'workout.loading_build' and 'workout.loading_review' are being added by a
// sibling PR (build/page.tsx:71 and review/page.tsx:105 already reference them). Remove these
// two entries once that PR lands so the guard covers them too.
const KNOWN_MISSING = new Set(['workout.loading_build', 'workout.loading_review']);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(target);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) && !/\.test\.tsx?$/.test(entry.name) ? [target] : [];
  });
}

/** Return the source text between a `t(` opener and its matching `)`, respecting nested parens and strings. */
function callArguments(source: string, openIndex: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') { index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return source.slice(openIndex + 1);
}

/** Literal `namespace.key` strings passed to t(...) — covers `t('a.b')` and `t(cond ? 'a.b' : 'c.d', {...})`. */
function literalTranslationKeys(source: string): Set<string> {
  const keys = new Set<string>();
  const opener = /(?<![\w$])t\(/g;
  for (const match of source.matchAll(opener)) {
    const args = callArguments(source, match.index + match[0].length - 1);
    const firstArgument = args.split(/,(?![^{]*})/)[0] ?? '';
    for (const literal of firstArgument.matchAll(/['"]([a-z][a-z0-9]*\.[a-z0-9_.]+)['"]/g)) keys.add(literal[1]);
  }
  return keys;
}

describe('workout module translation keys', () => {
  const root = process.cwd();
  const files = SOURCE_ROOTS.flatMap((directory) => collectSourceFiles(join(root, directory)));

  it('scans the workout components and routes', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('only calls t() with keys that exist in the core dictionary', () => {
    const missing: string[] = [];
    for (const file of files) {
      for (const key of literalTranslationKeys(readFileSync(file, 'utf8'))) {
        if (translations[key] || KNOWN_MISSING.has(key)) continue;
        missing.push(`${relative(root, file)} → ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers the equipment enum labels used by the picker, results, detail and plan cards', () => {
    for (const value of ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'cardio']) {
      expect(translations[`workout.equipment_${value}`], value).toBeTruthy();
    }
  });
});

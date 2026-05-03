import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry === '.git' ||
      entry === 'coverage' ||
      rel.startsWith('agents/evals/reports/')
    ) {
      return [];
    }
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function sourceFiles(scope: string): string[] {
  return walk(join(root, scope)).filter((file) => /\.(ts|tsx)$/.test(file));
}

describe('enterprise hardening invariants', () => {
  it('does not use Supabase .single() in application source', () => {
    const offenders = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('lib')]
      .filter((file) => readFileSync(file, 'utf8').includes('.single('))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('keeps live model identifiers out of routes and agents outside the router/client boundary', () => {
    const allowed = [
      'agents/router/',
      'agents/clients/',
      'agents/evals/',
      'agents/observability/',
      'agents/prompts/',
    ];
    const modelPattern = /(claude-[a-z0-9-]+|gemini-[0-9][a-z0-9.-]*|voyage-[a-z0-9-]+)/i;
    const offenders = [...sourceFiles('agents'), ...sourceFiles('app/api'), ...sourceFiles('lib')]
      .map((file) => relative(root, file))
      .filter((rel) => !allowed.some((prefix) => rel.startsWith(prefix)))
      .filter((rel) => modelPattern.test(readFileSync(join(root, rel), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('only uses dangerouslySetInnerHTML for the layout pre-paint theme script', () => {
    const offenders = [...sourceFiles('app'), ...sourceFiles('components')]
      .filter((file) => readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'))
      .map((file) => relative(root, file))
      .filter((rel) => rel !== 'app/layout.tsx');

    expect(offenders).toEqual([]);
  });
});

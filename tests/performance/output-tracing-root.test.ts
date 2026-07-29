import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Next output tracing root', () => {
  it('pins tracing to the active checkout instead of guessing from sibling lockfiles', () => {
    const config = readFileSync('next.config.ts', 'utf8');
    expect(config).toContain('outputFileTracingRoot: process.cwd()');
  });
});

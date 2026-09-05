import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCUMENTS = ['SECURITY.md', 'ARCHITECTURE.md', 'CODEX.md', 'ROADMAP.md'];

describe('request-gate documentation', () => {
  it('does not describe a nonexistent root middleware.ts as the auth gate', () => {
    for (const document of DOCUMENTS) {
      const source = readFileSync(resolve(process.cwd(), document), 'utf8');
      const staleLines = source.split(/\r?\n/).filter((line) => line.includes('middleware.ts') && !line.includes('supabase/'));
      expect(staleLines, `${document} contains stale root middleware references`).toEqual([]);
    }
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const verifier = readFileSync(
  new URL('../../scripts/db/verify.ts', import.meta.url),
  'utf8',
);

describe('shared Supabase public-read allowlist', () => {
  it('names each intentional Copa table explicitly without a prefix wildcard', () => {
    for (const table of [
      'copa_config',
      'copa_games',
      'copa_group_scores',
      'copa_matches',
      'copa_players',
      'copa_teams',
    ]) {
      expect(verifier).toContain(`'${table}'`);
    }
    expect(verifier).not.toMatch(/LIKE\s+['"]copa_%/i);
  });
});

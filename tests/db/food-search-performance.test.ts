import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('public food search performance migration', () => {
  it('backs every leading-wildcard language search with a trigram GIN index', () => {
    const migration = readFileSync(
      join(process.cwd(), 'drizzle/0060_food_database_trigram_search.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(migration).toContain('ALTER EXTENSION pg_trgm SET SCHEMA extensions');
    for (const column of ['name', 'name_el', 'name_es']) {
      expect(migration).toContain(`idx_food_db_${column}_trgm`);
      expect(migration).toMatch(
        new RegExp(`USING gin \\("${column}" extensions\\.gin_trgm_ops\\)`),
      );
    }
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: STAB-003 — legacy dish recipe policies were granted to PUBLIC
// Found by /qa on 2026-07-10
describe('dish recipe policy hardening migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'drizzle/0059_drop_public_dish_recipe_policies.sql'),
    'utf8',
  );

  it.each(['dish_recipes_select', 'dish_recipes_insert'])(
    'drops the legacy %s policy',
    (policy) => expect(sql).toContain(`DROP POLICY IF EXISTS ${policy}`),
  );
});

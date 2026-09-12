import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';
import { lockTextFoodCatalogue } from './text-food-catalogue';
const raw = process.env.AG1_TEXT_FOOD_TEST_DATABASE_URL;
// Dedicated disposable local database only; never DATABASE_URL or QA/project DB.
function connection() {
  const url = new URL(raw!);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '5432' || !/^\/trophe_text_food_ag1_[a-z0-9_]+$/.test(url.pathname) || url.search || url.hash) throw Error('isolated_database_required');
  return raw;
}
describe.skipIf(!raw)('real PostgreSQL catalogue transaction lock — dedicated disposable database', () => {
  const foodId = '00000000-0000-4000-8000-000000000020';
  let pool: pg.Pool; let created = false;
  const dialect = new PgDialect();
  const adapter = (client: pg.PoolClient) => ({ execute: async (value: Parameters<PgDialect['sqlToQuery']>[0]) => { const query = dialect.sqlToQuery(value); return client.query(query.sql, query.params); } });
  beforeAll(async () => { pool = new pg.Pool({ connectionString: connection(), max: 2 }); await pool.query('CREATE TABLE public.foods(id uuid PRIMARY KEY, kcal_per_100g real NOT NULL)'); created = true; await pool.query('INSERT INTO public.foods VALUES($1,130)', [foodId]); });
  afterAll(async () => { try { if (created) await pool.query('DROP TABLE public.foods'); } finally { await pool?.end(); } });
  it('blocks a concurrent nutrient update through the writer transaction', async () => {
    const writer = await pool.connect(), editor = await pool.connect();
    try {
      await writer.query('BEGIN'); await lockTextFoodCatalogue(adapter(writer) as never, [foodId]);
      expect((await writer.query('SELECT kcal_per_100g FROM public.foods WHERE id=$1', [foodId])).rows[0].kcal_per_100g).toBe(130);
      await editor.query('BEGIN'); await editor.query("SET LOCAL lock_timeout='100ms'");
      await expect(editor.query('UPDATE public.foods SET kcal_per_100g=999 WHERE id=$1', [foodId])).rejects.toMatchObject({ code: '55P03' });
      await editor.query('ROLLBACK');
      expect((await writer.query('SELECT kcal_per_100g FROM public.foods WHERE id=$1', [foodId])).rows[0].kcal_per_100g).toBe(130);
      await writer.query('COMMIT');
      await editor.query('UPDATE public.foods SET kcal_per_100g=140 WHERE id=$1', [foodId]);
      expect((await editor.query('SELECT kcal_per_100g FROM public.foods WHERE id=$1', [foodId])).rows[0].kcal_per_100g).toBe(140);
    } finally { await writer.query('ROLLBACK'); await editor.query('ROLLBACK'); writer.release(); editor.release(); }
  });
  it('rejects deleted references instead of allowing stale draft fallback', async () => {
    const writer = await pool.connect();
    try { await writer.query('BEGIN'); await writer.query('DELETE FROM public.foods WHERE id=$1', [foodId]); await expect(lockTextFoodCatalogue(adapter(writer) as never, [foodId])).rejects.toThrow('food_catalogue_conflict'); }
    finally { await writer.query('ROLLBACK'); writer.release(); }
  });
});

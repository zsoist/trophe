import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import pg from 'pg';
const testUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
if (!['localhost', '127.0.0.1', '[::1]'].includes(testUrl.hostname)) throw new Error('TRUNCATE privilege test requires an explicit isolated local database');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
afterAll(() => pool.end());
const migration = readFileSync('drizzle/0085_revoke_workout_table_truncate.sql', 'utf8');
it('revokes only TRUNCATE on the two scoped tables and remains idempotent', async () => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // This fixture runs only in the local/CI test database, inside rollback.
    await db.query('GRANT TRUNCATE, REFERENCES, TRIGGER ON public.exercises, public.client_profiles TO authenticated');
    const query = `SELECT t.table_name,p.privilege,has_table_privilege('authenticated',t.table_name,p.privilege) AS allowed FROM (VALUES ('public.exercises'),('public.client_profiles')) t(table_name) CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) ORDER BY 1,2`;
    const before = (await db.query(query)).rows;
    await db.query(migration);
    const after = (await db.query(query)).rows;
    expect(after.filter(r => r.privilege !== 'TRUNCATE')).toEqual(before.filter(r => r.privilege !== 'TRUNCATE'));
    expect(after.filter(r => r.privilege === 'TRUNCATE').map(r => r.allowed)).toEqual([false,false]);
    await db.query(migration); expect((await db.query(query)).rows).toEqual(after);
    for (const table of ['public.exercises','public.client_profiles']) {
      await db.query('SAVEPOINT denied');
      await db.query('SET LOCAL ROLE authenticated');
      await expect(db.query(`TRUNCATE TABLE ${table}`)).rejects.toMatchObject({ code: '42501' });
      await db.query('ROLLBACK TO SAVEPOINT denied');
    }
  } finally { await db.query('ROLLBACK'); db.release(); }
});

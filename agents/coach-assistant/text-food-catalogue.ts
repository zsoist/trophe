import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '@/db/client';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Keep referenced catalogue nutrition stable through derive AND canonical insert.
 * Deterministic order avoids opposite lock orders for multi-item meals.
 * A missing reference must never fall back to stale draft nutrition.
 */
export async function lockTextFoodCatalogue(tx: Pick<Tx, 'execute'>, ids: Array<string | null | undefined>) {
  for (const id of [...new Set(ids.filter((id): id is string => id != null))].sort()) {
    z.string().uuid().parse(id);
    const found = await tx.execute<{ id: string }>(sql`SELECT id FROM public.foods WHERE id=${id}::uuid FOR SHARE`);
    if (found.rows.length !== 1 || found.rows[0].id !== id) throw new Error('food_catalogue_conflict');
  }
}

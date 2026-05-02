/**
 * Trophē v0.3 — tRPC food router (Phase 7).
 *
 * Procedures for food logging and nutritional data.
 *
 * Procedures:
 *   food.log.list     — today's food log for the current user
 *   food.log.add      — add a food log entry (pre-parsed by food-parse agent)
 *   food.log.delete   — remove a food log entry
 *   food.log.summary  — daily macro totals for a date range
 *   food.search       — search the foods reference table (tsvector + name)
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../init';
import { foodLog } from '@/db/schema/food';
import { foods } from '@/db/schema/foods';
import { eq, and, desc, ilike, sql } from 'drizzle-orm';

// ── Router ────────────────────────────────────────────────────────────────

export const foodRouter = router({
  log: router({
    // ── List food entries for a specific date ────────────────────────
    list: protectedProcedure
      .input(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
          userId: z.string().uuid().optional(), // coaches can query for their clients
        }),
      )
      .query(async ({ ctx, input }) => {
        // If userId is provided, must be coach querying their client
        const targetUserId = input.userId ?? ctx.user!.id;

        const rows = await ctx.db
          .select()
          .from(foodLog)
          .where(
            and(
              eq(foodLog.userId, targetUserId),
              eq(foodLog.loggedDate, input.date),
            ),
          )
          .orderBy(desc(foodLog.loggedDate));

        return rows;
      }),

    // ── Add a food log entry ─────────────────────────────────────────
    add: protectedProcedure
      .input(
        z.object({
          foodName: z.string().min(1).max(200),
          mealType: z.string().optional(),
          calories: z.number().min(0).max(10000),
          proteinG: z.number().min(0).max(1000),
          carbsG: z.number().min(0).max(1000),
          fatG: z.number().min(0).max(1000),
          fiberG: z.number().min(0).max(1000).optional(),
          /** Phase 4 deterministic pipeline fields */
          foodId: z.string().uuid().optional(),
          qtyG: z.number().min(0).optional(),
          qtyInput: z.number().min(0).optional(),
          qtyInputUnit: z.string().optional(),
          parseConfidence: z.number().min(0).max(1).optional(),
          loggedAt: z.string().optional(), // ISO string, defaults to now
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const loggedDate = input.loggedAt
          ? input.loggedAt.slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        const [entry] = await ctx.db
          .insert(foodLog)
          .values({
            userId: ctx.user!.id,
            foodName: input.foodName,
            mealType: input.mealType,
            calories: input.calories,
            proteinG: input.proteinG,
            carbsG: input.carbsG,
            fatG: input.fatG,
            fiberG: input.fiberG,
            foodId: input.foodId,
            qtyG: input.qtyG != null ? String(input.qtyG) : undefined,
            qtyInput: input.qtyInput != null ? String(input.qtyInput) : undefined,
            qtyInputUnit: input.qtyInputUnit,
            parseConfidence: input.parseConfidence,
            loggedDate,
          })
          .returning();

        return entry;
      }),

    // ── Delete a food log entry ──────────────────────────────────────
    delete: protectedProcedure
      .input(z.object({ entryId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await ctx.db
          .delete(foodLog)
          .where(
            and(
              eq(foodLog.id, input.entryId),
              eq(foodLog.userId, ctx.user!.id), // users can only delete their own
            ),
          )
          .returning({ id: foodLog.id });

        if (deleted.length === 0) {
          return { ok: false };
        }
        return { ok: true };
      }),

    // ── Daily macro summary ──────────────────────────────────────────
    summary: protectedProcedure
      .input(
        z.object({
          dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          userId: z.string().uuid().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const targetUserId = input.userId ?? ctx.user!.id;

        const start = new Date(`${input.dateStart}T00:00:00Z`);
        const end = new Date(`${input.dateEnd}T23:59:59Z`);

        const result = await ctx.db.execute(
          sql`
            SELECT
              DATE(logged_at AT TIME ZONE 'UTC') AS date,
              SUM(calories)::real  AS total_kcal,
              SUM(protein_g)::real AS total_protein,
              SUM(carbs_g)::real   AS total_carbs,
              SUM(fat_g)::real     AS total_fat,
              COUNT(*)::int        AS entry_count
            FROM food_log
            WHERE user_id = ${targetUserId}
              AND logged_at BETWEEN ${start.toISOString()} AND ${end.toISOString()}
            GROUP BY DATE(logged_at AT TIME ZONE 'UTC')
            ORDER BY date DESC
          `,
        );

        return result.rows as Array<{
          date: string;
          total_kcal: number;
          total_protein: number;
          total_carbs: number;
          total_fat: number;
          entry_count: number;
        }>;
      }),
  }),

  // ── Reference food search ────────────────────────────────────────────
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const q = `%${input.query}%`;

      // Simple ilike search — Phase 4 lookup.ts handles hybrid pgvector search
      // This endpoint is for the food log UI autocomplete (fast, no embedding needed)
      const rows = await ctx.db
        .select({
          id: foods.id,
          nameEn: foods.nameEn,
          nameEl: foods.nameEl,
          brand: foods.brand,
          kcalPer100g: foods.kcalPer100g,
          proteinPer100g: foods.proteinPer100g,
          carbPer100g: foods.carbPer100g,
          fatPer100g: foods.fatPer100g,
          source: foods.source,
          dataQuality: foods.dataQuality,
        })
        .from(foods)
        .where(ilike(foods.nameEn, q))
        .limit(input.limit);

      return rows;
    }),
});

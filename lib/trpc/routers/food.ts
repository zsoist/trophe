/**
 * Trophē v0.3 — tRPC food router (Phase 7).
 *
 * Procedures for food logging and nutritional data.
 *
 * Procedures:
 *   food.log.list       — today's food log for the current user
 *   food.log.add        — add a food log entry (pre-parsed by food-parse agent)
 *   food.log.delete     — remove a food log entry
 *   food.log.edit       — edit own entry (name/qty/grams/macros) + flywheel capture
 *   food.log.coachEdit  — coach edits a client entry (tenant-checked) + capture
 *   food.log.summary    — daily macro totals for a date range
 *   food.corrections.captureAdjustment — fire-and-forget correction telemetry
 *   food.search         — search the foods reference table (tsvector + name)
 */

import { z } from 'zod';
import { applyFoodLogEdit, editFieldsSchema } from '@/lib/food/log-edit-service';
export { isAiSourced, macrosMateriallyChanged } from '@/lib/food/log-edit-service';
import { router, protectedProcedure, coachProcedure } from '../init';
import { foodLog, foodParseCorrections } from '@/db/schema/food';
import { foods } from '@/db/schema/foods';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { assertCanAccessClient } from '@/lib/auth/tenant-access';
import { recordAuditEvent } from '@/lib/utils/audit';
import type { Context } from '../context';

async function resolveFoodLogTargetUser(
  ctx: Context,
  requestedUserId?: string,
): Promise<string> {
  const ownUserId = ctx.user!.id;
  if (!requestedUserId || requestedUserId === ownUserId) return ownUserId;

  if (!ctx.profile) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Profile required for cross-user access' });
  }

  await assertCanAccessClient(ctx.db, ownUserId, ctx.profile.role, requestedUserId);
  return requestedUserId;
}

// ── Edit + correction-capture helpers (flywheel, migration 0035) ──────────

export const foodSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(20).default(10),
});

export function escapeFoodSearchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}

const foodLogMealTypeSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'pre_workout',
  'post_workout',
]);

export const foodLogAddSchema = z.object({
  foodName: z.string().trim().min(1).max(200),
  mealType: foodLogMealTypeSchema,
  calories: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
  fiberG: z.number().min(0).max(1000).optional(),
  foodId: z.string().uuid().optional(),
  qtyG: z.number().gt(0).max(10000).optional(),
  qtyInput: z.number().gt(0).max(10000).optional(),
  qtyInputUnit: z.string().trim().min(1).max(50).optional(),
  parseConfidence: z.number().min(0).max(1).optional(),
  // Calendar ownership stays with the client. The server cannot infer a
  // user's local day safely from its own UTC clock.
  loggedDate: z.iso.date(),
}).refine(
  (value) => (value.qtyInput === undefined) === (value.qtyInputUnit === undefined),
  { path: ['qtyInput'], message: 'qtyInput and qtyInputUnit must be provided together' },
);


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
        const targetUserId = await resolveFoodLogTargetUser(ctx, input.userId);

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
      .input(foodLogAddSchema)
      .mutation(async ({ ctx, input }) => {
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
            loggedDate: input.loggedDate,
          })
          .returning();

        if (!entry) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Food log was not saved' });
        }
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

    // ── Edit a food log entry (+ correction-capture flywheel) ────────────
    // When a human corrects an AI-parsed entry, we record (input → AI estimate
    // → human truth) as a gold label for fine-tuning (migration 0035).
    edit: protectedProcedure
      .input(editFieldsSchema.extend({ entryId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        // Load the existing entry — own log only (coach-side correction goes
        // through food.log.coachEdit with its own tenant authorization).
        const [existing] = await ctx.db
          .select()
          .from(foodLog)
          .where(and(eq(foodLog.id, input.entryId), eq(foodLog.userId, ctx.user!.id)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });

        const { updated } = await applyFoodLogEdit({
          ctx,
          existing,
          input,
          ownerUserId: ctx.user!.id,
          correctedBy: ctx.user!.id,
        });

        return updated;
      }),

    // ── Coach edits a client's entry (tenant-checked, server-side) ───────
    // Coaches are RLS SELECT-only on client logs, so the write MUST happen
    // here via ctx.db (DB-owner pool) after assertCanAccessClient authorizes
    // the coach→client relationship. Corrections attribute the coach via
    // corrected_by (column exists in migration 0035).
    coachEdit: coachProcedure
      .input(
        editFieldsSchema.extend({
          clientId: z.string().uuid(),
          entryId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAccessClient(ctx.db, ctx.user!.id, ctx.profile!.role, input.clientId);

        // The entry must belong to the client the coach is authorized for.
        const [existing] = await ctx.db
          .select()
          .from(foodLog)
          .where(and(eq(foodLog.id, input.entryId), eq(foodLog.userId, input.clientId)))
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found for this client' });
        }

        const { updated, captured } = await applyFoodLogEdit({
          ctx,
          existing,
          input,
          ownerUserId: input.clientId,
          correctedBy: ctx.user!.id,
        });

        // Audit coverage (DPA Annex II): who edited which client's log entry.
        await recordAuditEvent({
          actorId: ctx.user!.id,
          actorRole: ctx.profile!.role,
          action: 'coach_food_log_edited',
          tableName: 'food_log',
          recordId: input.entryId,
          oldValue: {
            clientId: input.clientId,
            foodName: existing.foodName,
            calories: existing.calories,
            proteinG: existing.proteinG,
            carbsG: existing.carbsG,
            fatG: existing.fatG,
          },
          newValue: {
            clientId: input.clientId,
            foodName: updated.foodName,
            calories: updated.calories,
            proteinG: updated.proteinG,
            carbsG: updated.carbsG,
            fatG: updated.fatG,
            correctionCaptured: captured,
          },
        });

        return updated;
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
        const targetUserId = await resolveFoodLogTargetUser(ctx, input.userId);

        const result = await ctx.db.execute(
          sql`
            SELECT
              logged_date AS date,
              SUM(calories)::real  AS total_kcal,
              SUM(protein_g)::real AS total_protein,
              SUM(carbs_g)::real   AS total_carbs,
              SUM(fat_g)::real     AS total_fat,
              COUNT(*)::int        AS entry_count
            FROM food_log
            WHERE user_id = ${targetUserId}
              AND logged_date BETWEEN ${input.dateStart}::date AND ${input.dateEnd}::date
            GROUP BY logged_date
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

  // ── Correction telemetry (flywheel, migration 0035) ──────────────────
  corrections: router({
    /**
     * Fire-and-forget capture for adjustments made OUTSIDE a food_log edit
     * (e.g. the user tweaks an AI parse before/without a persisted entry).
     * Silent success: telemetry must never break the caller — DB failures
     * are swallowed (logged server-side) and { ok } is always returned.
     */
    captureAdjustment: protectedProcedure
      .input(
        z.object({
          rawText: z.string().min(1).max(500),
          foodName: z.string().min(1).max(200),
          aiSource: z.string().min(1).max(50),
          parseConfidence: z.number().min(0).max(1).nullish(),
          foodLogId: z.string().uuid().nullish(),
          before: z.object({
            grams: z.number().min(0).max(10000).nullish(),
            calories: z.number().min(0).max(10000),
            protein_g: z.number().min(0).max(1000),
            carbs_g: z.number().min(0).max(1000),
            fat_g: z.number().min(0).max(1000),
          }),
          after: z.object({
            grams: z.number().min(0).max(10000).nullish(),
            calories: z.number().min(0).max(10000),
            protein_g: z.number().min(0).max(1000),
            carbs_g: z.number().min(0).max(1000),
            fat_g: z.number().min(0).max(1000),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Clamp to numeric(8,2)-safe precision (zod already bounds ranges).
        const c2 = (v: number) => Math.round(v * 100) / 100;
        try {
          await ctx.db.insert(foodParseCorrections).values({
            userId: ctx.user!.id,
            correctedBy: ctx.user!.id,
            foodLogId: input.foodLogId ?? null,
            // input_text = the raw model input; the parsed name (input.foodName)
            // lives on the linked food_log row — 0035 has no ai_food_name column.
            inputText: input.rawText,
            qtyInput: input.before.grams != null ? String(c2(input.before.grams)) : null,
            qtyInputUnit: input.before.grams != null ? 'g' : null,
            aiSource: input.aiSource,
            aiConfidence: input.parseConfidence ?? null,
            aiCalories: c2(input.before.calories),
            aiProteinG: c2(input.before.protein_g),
            aiCarbsG: c2(input.before.carbs_g),
            aiFatG: c2(input.before.fat_g),
            correctedCalories: c2(input.after.calories),
            correctedProteinG: c2(input.after.protein_g),
            correctedCarbsG: c2(input.after.carbs_g),
            correctedFatG: c2(input.after.fat_g),
          });
          return { ok: true };
        } catch (e) {
          console.error('[flywheel] captureAdjustment failed (non-blocking):', e);
          return { ok: false };
        }
      }),
  }),

  // ── Reference food search ────────────────────────────────────────────
  search: protectedProcedure
    .input(foodSearchInputSchema)
    .query(async ({ ctx, input }) => {
      const q = escapeFoodSearchPattern(input.query);
      const foodSearchText = sql<string>`(
        COALESCE(${foods.nameEn}, '') || ' ' ||
        COALESCE(${foods.nameEl}, '') || ' ' ||
        COALESCE(${foods.nameEs}, '') || ' ' ||
        COALESCE(${foods.nameFr}, '') || ' ' ||
        COALESCE(${foods.nameIt}, '') || ' ' ||
        COALESCE(${foods.nameNl}, '') || ' ' ||
        COALESCE(${foods.brand}, '')
      )`;

      // This expression exactly matches the trigram GIN index in migration 0063.
      // It keeps substring autocomplete multilingual without invoking embeddings.
      const rows = await ctx.db
        .select({
          id: foods.id,
          nameEn: foods.nameEn,
          nameEl: foods.nameEl,
          nameEs: foods.nameEs,
          nameFr: foods.nameFr,
          nameIt: foods.nameIt,
          nameNl: foods.nameNl,
          brand: foods.brand,
          kcalPer100g: foods.kcalPer100g,
          proteinPer100g: foods.proteinPer100g,
          carbPer100g: foods.carbPer100g,
          fatPer100g: foods.fatPer100g,
          source: foods.source,
          dataQuality: foods.dataQuality,
        })
        .from(foods)
        .where(sql`${foodSearchText} ILIKE ${q} ESCAPE '\\'`)
        .orderBy(desc(foods.popularity), foods.nameEn)
        .limit(input.limit);

      return rows;
    }),
});

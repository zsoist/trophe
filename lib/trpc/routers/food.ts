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
import { router, protectedProcedure, coachProcedure } from '../init';
import { foodLog, foodParseCorrections } from '@/db/schema/food';
import { foods } from '@/db/schema/foods';
import { eq, and, desc, ilike, sql } from 'drizzle-orm';
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

type FoodLogRow = typeof foodLog.$inferSelect;

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v);
const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Is this entry AI-sourced (i.e. a correction to it is a training label)?
 * Modern rows carry parse_confidence; LEGACY AI rows lack confidence but
 * carry source = 'natural_language' | 'photo_ai'. Both must capture.
 */
export function isAiSourced(
  row: Pick<FoodLogRow, 'parseConfidence' | 'source'>,
): boolean {
  return (
    row.parseConfidence != null ||
    row.source === 'natural_language' ||
    row.source === 'photo_ai'
  );
}

/**
 * Material change gate: >5% (or >1 absolute) on any of the four core macros.
 * Tiny rounding jitter is not a label.
 */
export function macrosMateriallyChanged(
  before: { calories: number; proteinG: number; carbsG: number; fatG: number },
  after: { calories: number; proteinG: number; carbsG: number; fatG: number },
): boolean {
  const changed = (x: number, y: number) =>
    Math.abs(x - y) > Math.max(1, 0.05 * Math.max(Math.abs(x), Math.abs(y)));
  return (
    changed(before.calories, after.calories) ||
    changed(before.proteinG, after.proteinG) ||
    changed(before.carbsG, after.carbsG) ||
    changed(before.fatG, after.fatG)
  );
}

/** Shared optional edit fields for log.edit and log.coachEdit. */
const editFieldsSchema = z.object({
  quantity: z.number().gt(0).max(1000).optional(),
  grams: z.number().gt(0).max(10000).optional(),
  foodName: z.string().min(1).max(200).optional(),
  calories: z.number().min(0).max(10000).optional(),
  proteinG: z.number().min(0).max(1000).optional(),
  carbsG: z.number().min(0).max(1000).optional(),
  fatG: z.number().min(0).max(1000).optional(),
  fiberG: z.number().min(0).max(1000).optional(),
  sugarG: z.number().min(0).max(1000).optional(),
});
type EditFields = z.infer<typeof editFieldsSchema>;

/**
 * Apply an edit to a food_log row, recomputing what's derivable:
 *   1. explicit macro values win, per-field;
 *   2. else if `grams` given and the row links a canonical food →
 *      deterministic recompute from foods per-100g (Phase 4 pattern);
 *   3. else if `grams` given and the row has qty_g → scale by grams ratio;
 *   4. else if `quantity` given → scale by quantity ratio (legacy path,
 *      matches the old MealSlotCard client-side factor math);
 *   5. else keep existing.
 * Then, when the entry is AI-sourced and macros materially changed, INSERT a
 * correction row (gold label) — non-blocking, telemetry must never fail edits.
 */
async function applyFoodLogEdit(opts: {
  ctx: Context;
  existing: FoodLogRow;
  input: EditFields;
  /** Whose log the entry belongs to (corrections.user_id). */
  ownerUserId: string;
  /** Who made the correction (corrections.corrected_by) — client or coach. */
  correctedBy: string;
}): Promise<{ updated: FoodLogRow; captured: boolean }> {
  const { ctx, existing, input, ownerUserId, correctedBy } = opts;

  // ── Derive macros ──
  let derived: {
    calories: number; proteinG: number; carbsG: number; fatG: number;
    fiberG: number | null; sugarG: number | null;
  } | null = null;

  if (input.grams != null && existing.foodId) {
    const [food] = await ctx.db
      .select({
        kcalPer100g: foods.kcalPer100g,
        proteinPer100g: foods.proteinPer100g,
        carbPer100g: foods.carbPer100g,
        fatPer100g: foods.fatPer100g,
        fiberPer100g: foods.fiberPer100g,
        sugarPer100g: foods.sugarPer100g,
      })
      .from(foods)
      .where(eq(foods.id, existing.foodId))
      .limit(1);
    if (food) {
      const g = input.grams;
      derived = {
        calories: Math.round((g * food.kcalPer100g) / 100),
        proteinG: round1((g * food.proteinPer100g) / 100),
        carbsG: round1((g * food.carbPer100g) / 100),
        fatG: round1((g * food.fatPer100g) / 100),
        fiberG: food.fiberPer100g != null ? round1((g * food.fiberPer100g) / 100) : existing.fiberG,
        sugarG: food.sugarPer100g != null ? round1((g * food.sugarPer100g) / 100) : existing.sugarG,
      };
    }
  }

  let factor: number | null = null;
  if (!derived) {
    const existingQtyG = existing.qtyG != null ? Number(existing.qtyG) : null;
    if (input.grams != null && existingQtyG != null && existingQtyG > 0) {
      factor = input.grams / existingQtyG;
    } else if (input.grams == null && input.quantity != null && existing.quantity > 0) {
      factor = input.quantity / existing.quantity;
    }
  }

  const scaled = (v: number | null, kcal = false): number | null => {
    if (factor == null || v == null) return v;
    return kcal ? Math.round(v * factor) : round1(v * factor);
  };

  const next = {
    foodName: input.foodName ?? existing.foodName,
    quantity: input.quantity ?? existing.quantity,
    qtyG: input.grams != null ? String(input.grams) : existing.qtyG,
    calories: input.calories ?? derived?.calories ?? scaled(existing.calories, true),
    proteinG: input.proteinG ?? derived?.proteinG ?? scaled(existing.proteinG),
    carbsG: input.carbsG ?? derived?.carbsG ?? scaled(existing.carbsG),
    fatG: input.fatG ?? derived?.fatG ?? scaled(existing.fatG),
    fiberG: input.fiberG ?? derived?.fiberG ?? scaled(existing.fiberG),
    sugarG: input.sugarG ?? derived?.sugarG ?? scaled(existing.sugarG),
  };

  const [updated] = await ctx.db
    .update(foodLog)
    .set(next)
    .where(and(eq(foodLog.id, existing.id), eq(foodLog.userId, ownerUserId)))
    .returning();
  if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Entry not found' });

  // ── Flywheel capture (migration 0035) — non-blocking telemetry ──
  // Gate: AI-sourced (parse_confidence set OR legacy source natural_language/
  // photo_ai) AND a material macro change. ai_source falls back to the row's
  // source value so legacy rows without confidence still capture.
  let captured = false;
  const before = {
    calories: num(existing.calories), proteinG: num(existing.proteinG),
    carbsG: num(existing.carbsG), fatG: num(existing.fatG),
  };
  const after = {
    calories: num(next.calories), proteinG: num(next.proteinG),
    carbsG: num(next.carbsG), fatG: num(next.fatG),
  };
  if (isAiSourced(existing) && macrosMateriallyChanged(before, after)) {
    try {
      await ctx.db.insert(foodParseCorrections).values({
        userId: ownerUserId,
        correctedBy,
        foodLogId: existing.id,
        inputText: existing.foodName,
        qtyInput: existing.qtyInput,
        qtyInputUnit: existing.qtyInputUnit,
        aiSource: existing.source,
        aiConfidence: existing.parseConfidence,
        aiCalories: before.calories,
        aiProteinG: before.proteinG,
        aiCarbsG: before.carbsG,
        aiFatG: before.fatG,
        correctedCalories: after.calories,
        correctedProteinG: after.proteinG,
        correctedCarbsG: after.carbsG,
        correctedFatG: after.fatG,
      });
      captured = true;
    } catch (e) {
      console.error('[flywheel] correction capture failed (non-blocking):', e);
    }
  }

  return { updated, captured };
}

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

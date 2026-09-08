import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { foodLog, foodParseCorrections } from '@/db/schema/food';
import { foods } from '@/db/schema/foods';
import type { Context } from '@/lib/trpc/context';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';

export type FoodLogRow = typeof foodLog.$inferSelect;
export type FoodEditDatabase=Pick<Context['db'],'select'|'update'|'insert'|'execute'>;
const num = (v:number|string|null|undefined):number=>v==null?0:Number(v);
const round1=(v:number):number=>Math.round(v*10)/10;

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
export const editFieldsSchema = z.object({
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
export type EditFields = z.infer<typeof editFieldsSchema>;
export const foodQuantityChangeSchema=editFieldsSchema.pick({grams:true}).required();
export const parseFoodQuantityChange=(input:unknown)=>foodQuantityChangeSchema.parse(input);

/** The existing manual Food calculation, shared with reviewed previews. */
export async function deriveFoodLogEdit(database:Pick<FoodEditDatabase,'select'>,existing:FoodLogRow,input:EditFields) {
  input=editFieldsSchema.parse(input);
  const ctx={db:database};
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

  return next;
}
export type FoodEditValues=Awaited<ReturnType<typeof deriveFoodLogEdit>>;

/** One writer for manual edits and reviewed quantity changes. The caller owns
 * authorization; durable callers hold owner/org/entry/basis locks and use a tx.
 */
export async function applyFoodLogEdit(opts:{ctx:{db:FoodEditDatabase};existing:FoodLogRow;input:EditFields;ownerUserId:string;correctedBy:string;expectedEdit?:FoodEditValues;transactional?:boolean}):Promise<{updated:FoodLogRow;captured:boolean}> {
  const {ctx,existing,input,ownerUserId,correctedBy}=opts;
  if(existing.userId!==ownerUserId)throw new TRPCError({code:'FORBIDDEN'});
  const next=await deriveFoodLogEdit(ctx.db,existing,input);
  if(opts.expectedEdit&&(Object.keys(next).length!==Object.keys(opts.expectedEdit).length||(Object.keys(next) as Array<keyof FoodEditValues>).some(key=>next[key]!==opts.expectedEdit![key])))throw new TRPCError({code:'CONFLICT',message:'Food calculation changed since review'});
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
    if(opts.transactional)await ctx.db.execute(sql`SAVEPOINT food_edit_correction`);
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
      if(opts.transactional)await ctx.db.execute(sql`RELEASE SAVEPOINT food_edit_correction`);
      captured = true;
    } catch (e) {
      if(opts.transactional) {
        await ctx.db.execute(sql`ROLLBACK TO SAVEPOINT food_edit_correction`);
        await ctx.db.execute(sql`RELEASE SAVEPOINT food_edit_correction`);
      }
      console.error('[flywheel] correction capture failed (non-blocking):', safeErrorMetadata(e));
    }
  }

  return { updated, captured };
}

// ── Router ────────────────────────────────────────────────────────────────

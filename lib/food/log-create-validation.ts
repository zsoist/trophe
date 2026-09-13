import { z } from 'zod';
import { mealSlotMatchesMealType } from './meal-slot';

/** Extracted unchanged from food.log.add; preserve its public parsing behavior. */
const foodLogMealTypeSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'pre_workout',
  'post_workout',
]);

/** Explicit slot token (see lib/food/meal-slot.ts). Optional: callers that only
 * know the coarse meal omit it and keep the exact pre-0089 payload shape. */
const foodLogMealSlotSchema = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'snack_am',
  'snack_pm',
  'snack',
  'pre_workout',
  'post_workout',
]);

export const foodLogAddSchema = z.object({
  foodName: z.string().trim().min(1).max(200),
  mealType: foodLogMealTypeSchema,
  mealSlot: foodLogMealSlotSchema.optional(),
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
).refine(
  // Reject an invalid slot/mealType combination BEFORE any write: 'snack_am' /
  // 'snack_pm' are snacks, every other token equals its meal type.
  (value) => value.mealSlot === undefined || mealSlotMatchesMealType(value.mealSlot, value.mealType),
  { path: ['mealSlot'], message: 'mealSlot must be consistent with mealType' },
);

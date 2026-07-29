import { z } from 'zod';

export const macroEstimateStructuredSchema = z.object({
  estimates: z.array(z.object({
    item_index: z.number().int().min(1).max(12),
    food_name: z.string().min(1),
    grams: z.number().positive().max(10_000),
    calories: z.number().nonnegative().max(10_000),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    fiber_g: z.number().nonnegative(),
    sugar_g: z.number().nonnegative(),
  })).min(1),
});

export const macroEstimateGeminiResponseSchema = {
  type: 'object',
  required: ['estimates'],
  properties: {
    estimates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item_index', 'food_name', 'grams', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'],
        properties: {
          item_index: { type: 'integer' },
          food_name: { type: 'string' }, grams: { type: 'number' }, calories: { type: 'number' },
          protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' },
          fiber_g: { type: 'number' }, sugar_g: { type: 'number' },
        },
      },
    },
  },
} as const;

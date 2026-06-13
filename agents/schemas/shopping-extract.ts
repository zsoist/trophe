import { z } from 'zod';

/**
 * Shopping-list extraction schema (Daily Nutrafit "Shopping Lists" feature).
 *
 * The meal-plan cells are free text ("2 grilled chicken breasts + 1 cup rice",
 * Greek dishes, etc.). We ask DeepSeek to turn the week's distinct meals into a
 * FLAT list of grocery line-items — one entry per ingredient occurrence. The
 * de-duplication / merging across occurrences happens deterministically in
 * lib/shopping-list.ts (aggregateIngredients), not in the model.
 *
 * `category` buckets each item so the UI can group the list the way a shopper
 * walks a store. JSON Schema uses additionalProperties:false at every level for
 * DeepSeek strict tool calling.
 */

export const SHOPPING_CATEGORIES = [
  'produce', 'protein', 'dairy', 'grains', 'pantry', 'frozen', 'bakery', 'other',
] as const;

export const shoppingExtractValidator = z.object({
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    unit: z.string(),
    category: z.enum(SHOPPING_CATEGORIES),
  })),
});

export type ShoppingExtractOutput = z.infer<typeof shoppingExtractValidator>;
export type ShoppingItem = ShoppingExtractOutput['items'][number];

export const shoppingExtractJsonSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'quantity', 'unit', 'category'],
        properties: {
          name: { type: 'string', description: 'canonical grocery name, lowercase, singular (e.g. "chicken breast", "olive oil")' },
          quantity: { type: 'number', description: 'numeric amount for this occurrence; 0 if unspecified' },
          unit: { type: 'string', description: 'unit such as g, ml, piece, cup, tbsp, slice; empty string if none' },
          category: { type: 'string', enum: [...SHOPPING_CATEGORIES] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

import { z } from 'zod';

export const foodParseStructuredSchema = z.object({
  needs_clarification: z.boolean(),
  clarification_question: z.union([z.string(), z.array(z.string()).transform(a => a.join(' '))]).nullable(),
  items: z.array(z.object({
    raw_text: z.string(),
    food_name: z.string().min(1),
    name_localized: z.string(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    qualifier: z.string().nullable().optional(),
    food_state: z.enum(['raw', 'cooked', 'fried', 'grilled', 'baked', 'boiled', 'steamed', 'roasted', 'prepared', 'unknown']),
    portion_explicit: z.boolean(),
    confidence: z.number().min(0).max(1),
    recognized: z.boolean(),
    // v5 CoT macro estimation fields (optional for backward compat with v4 prompt)
    estimated_grams: z.number().nonnegative().optional(),
    estimated_calories: z.number().nonnegative().optional(),
    estimated_protein_g: z.number().nonnegative().optional(),
    estimated_carbs_g: z.number().nonnegative().optional(),
    estimated_fat_g: z.number().nonnegative().optional(),
    nutrition_reasoning: z.string().optional(),
    estimation_confidence: z.number().min(0).max(1).optional(),
    // v6 per-100g fields (LLM reports per-100g, code multiplies by grams)
    per_100g_kcal: z.number().nonnegative().optional(),
    per_100g_protein: z.number().nonnegative().optional(),
    per_100g_carbs: z.number().nonnegative().optional(),
    per_100g_fat: z.number().nonnegative().optional(),
  })),
});

export type FoodParseStructuredOutput = z.infer<typeof foodParseStructuredSchema>;

export const foodParseGeminiResponseSchema = {
  type: 'object',
  required: ['needs_clarification', 'clarification_question', 'items'],
  properties: {
    needs_clarification: { type: 'boolean' },
    clarification_question: { type: 'string', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['raw_text', 'food_name', 'name_localized', 'quantity', 'unit', 'food_state', 'portion_explicit', 'confidence', 'recognized'],
        properties: {
          raw_text: { type: 'string' },
          food_name: { type: 'string' },
          name_localized: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          qualifier: { type: 'string', nullable: true },
          food_state: { type: 'string', enum: ['raw', 'cooked', 'fried', 'grilled', 'baked', 'boiled', 'steamed', 'roasted', 'prepared', 'unknown'] },
          portion_explicit: { type: 'boolean' },
          confidence: { type: 'number' },
          recognized: { type: 'boolean' },
          // v5 CoT macro estimation fields
          estimated_grams: { type: 'number' },
          estimated_calories: { type: 'number' },
          estimated_protein_g: { type: 'number' },
          estimated_carbs_g: { type: 'number' },
          estimated_fat_g: { type: 'number' },
          nutrition_reasoning: { type: 'string' },
          estimation_confidence: { type: 'number' },
          // v6 per-100g fields
          per_100g_kcal: { type: 'number' },
          per_100g_protein: { type: 'number' },
          per_100g_carbs: { type: 'number' },
          per_100g_fat: { type: 'number' },
        },
      },
    },
  },
};

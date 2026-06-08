import { z } from 'zod';

export const foodParseStructuredSchema = z.object({
  needs_clarification: z.boolean(),
  clarification_question: z.string().nullable(),
  items: z.array(z.object({
    raw_text: z.string(),
    food_name: z.string().min(1),
    name_localized: z.string(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    qualifier: z.string().nullable().optional(),
    food_state: z.enum(['raw', 'cooked', 'fried', 'grilled', 'baked', 'boiled', 'prepared', 'unknown']),
    portion_explicit: z.boolean(),
    confidence: z.number().min(0).max(1),
    recognized: z.boolean(),
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
          food_state: { type: 'string', enum: ['raw', 'cooked', 'fried', 'grilled', 'baked', 'boiled', 'prepared', 'unknown'] },
          portion_explicit: { type: 'boolean' },
          confidence: { type: 'number' },
          recognized: { type: 'boolean' },
        },
      },
    },
  },
};

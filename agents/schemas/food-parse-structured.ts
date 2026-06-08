import { z } from 'zod';

export const foodParseStructuredSchema = z.object({
  items: z.array(z.object({
    raw_text: z.string(),
    food_name: z.string().min(1),
    name_localized: z.string(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    qualifier: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1),
    recognized: z.boolean(),
  })),
});

export type FoodParseStructuredOutput = z.infer<typeof foodParseStructuredSchema>;

export const foodParseGeminiResponseSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['raw_text', 'food_name', 'name_localized', 'quantity', 'unit', 'confidence', 'recognized'],
        properties: {
          raw_text: { type: 'string' },
          food_name: { type: 'string' },
          name_localized: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          qualifier: { type: 'string', nullable: true },
          confidence: { type: 'number' },
          recognized: { type: 'boolean' },
        },
      },
    },
  },
};

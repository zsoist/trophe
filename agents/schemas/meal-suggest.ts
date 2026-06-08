import { z } from 'zod';

/**
 * Meal suggestion structured output schema.
 *
 * Used by invokeStructuredProvider to validate responses from any LLM provider
 * (DeepSeek tool calling, Anthropic tool_use, or Gemini constrained decoding).
 *
 * The JSON Schema variant uses additionalProperties: false at every level
 * for DeepSeek strict function calling compatibility.
 */

export const mealSuggestionValidator = z.object({
  suggestions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    ingredients: z.array(z.string()),
    estimated_calories: z.number(),
    estimated_protein_g: z.number(),
    estimated_carbs_g: z.number(),
    estimated_fat_g: z.number(),
  })),
});

export type MealSuggestionOutput = z.infer<typeof mealSuggestionValidator>;

/** JSON Schema for tool calling / constrained decoding — strict-mode safe. */
export const mealSuggestJsonSchema = {
  type: 'object',
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'name', 'description', 'ingredients',
          'estimated_calories', 'estimated_protein_g',
          'estimated_carbs_g', 'estimated_fat_g',
        ],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          ingredients: { type: 'array', items: { type: 'string' } },
          estimated_calories: { type: 'number' },
          estimated_protein_g: { type: 'number' },
          estimated_carbs_g: { type: 'number' },
          estimated_fat_g: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

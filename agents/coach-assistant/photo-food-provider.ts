import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { LUNA_MODEL } from '@/agents/router/policies';
import { invokeOpenAiStructured } from '@/agents/runtime/providers/openai';
import type { runVerifiedPhotoFoodAnalysis } from './photo-food-observation-adapter';

const prompt = readFileSync(join(process.cwd(), 'agents/prompts/photo-analyze.v2.md'), 'utf8').trim();
const tool = {
  name: 'submit_food_photo_analysis',
  description: 'Submit conservative nutrition estimates for visible foods in a photo.',
  input_schema: {
    type: 'object',
    properties: {
      dish_name: { type: 'string' },
      foods: {
        type: 'array', minItems: 1, maxItems: 8,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' }, estimated_grams: { type: 'number' }, estimated_calories: { type: 'number' },
            estimated_protein_g: { type: 'number' }, estimated_carbs_g: { type: 'number' }, estimated_fat_g: { type: 'number' },
            estimated_fiber_g: { type: 'number' }, estimated_sugar_g: { type: 'number' }, confidence: { type: 'number' },
            source: { type: 'string', enum: ['ai_estimate'] }, accuracy_note: { type: 'string' },
          },
          required: ['name', 'estimated_grams', 'estimated_calories', 'estimated_protein_g', 'estimated_carbs_g', 'estimated_fat_g', 'estimated_fiber_g', 'estimated_sugar_g', 'confidence', 'source', 'accuracy_note'],
          additionalProperties: false,
        },
      },
    },
    required: ['dish_name', 'foods'],
    additionalProperties: false,
  },
} as const;

const photoOutputSchema = z.object({
  dish_name: z.string(),
  foods: z.array(z.object({
    name: z.string(), estimated_grams: z.number(), estimated_calories: z.number(),
    estimated_protein_g: z.number(), estimated_carbs_g: z.number(), estimated_fat_g: z.number(),
    estimated_fiber_g: z.number(), estimated_sugar_g: z.number(), confidence: z.number(),
    source: z.literal('ai_estimate'), accuracy_note: z.string(),
  }).strict()).min(1).max(8),
}).strict();

type PhotoInvoke = Parameters<typeof runVerifiedPhotoFoodAnalysis>[2]['invoke'];

/** Server-only Luna vision transport. It accepts server-supplied image bytes
 * and never accepts a browser URL. The durable adapter supplies normalized
 * JPEG bytes; the legacy HTTP adapter preserves its accepted image types. */
export const invokePrivatePhotoFoodProvider: PhotoInvoke = async ({ policy, signal, image }) => {
  if (policy.provider !== 'openai' || policy.model !== LUNA_MODEL) throw new Error('budget_blocked');
  const result = await invokeOpenAiStructured({
    model: policy.model,
    system: prompt,
    prompt: 'Analyze the attached food photo and submit the conservative structured result.',
    maxTokens: policy.maxTokens,
    signal,
    toolName: tool.name,
    description: tool.description,
    schema: tool.input_schema,
    validator: photoOutputSchema,
    strict: true,
    maxAttempts: 1,
    reasoningEffort: policy.reasoningEffort,
    store: false,
    image,
  });
  return {
    ...result,
    output: { content: [{ type: 'tool_use', name: tool.name, input: result.output }] },
  };
};

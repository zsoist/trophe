import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { invokeAnthropicJson } from '@/agents/runtime/providers/anthropic';
import type { runVerifiedPhotoFoodAnalysis } from './photo-food-observation-adapter';

const prompt = readFileSync(join(process.cwd(), 'agents/prompts/photo-analyze.v1.md'), 'utf8').trim();
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
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string' }, estimated_grams: { type: 'number' }, estimated_calories: { type: 'number' },
            estimated_protein_g: { type: 'number' }, estimated_carbs_g: { type: 'number' }, estimated_fat_g: { type: 'number' },
            estimated_fiber_g: { type: 'number' }, estimated_sugar_g: { type: 'number' }, confidence: { type: 'number' },
            source: { type: 'string', enum: ['ai_estimate'] }, accuracy_note: { type: 'string' },
          },
          required: ['name', 'estimated_grams', 'estimated_calories', 'estimated_protein_g', 'estimated_carbs_g', 'estimated_fat_g', 'estimated_fiber_g', 'estimated_sugar_g', 'confidence', 'source', 'accuracy_note'],
        },
      },
    },
    required: ['dish_name', 'foods'],
  },
} as const;

type PhotoInvoke = Parameters<typeof runVerifiedPhotoFoodAnalysis>[2]['invoke'];

/** Server-only Anthropic transport. It accepts only normalized JPEG bytes from
 * the private observation adapter and never accepts a browser URL or prompt. */
export const invokePrivatePhotoFoodProvider: PhotoInvoke = ({ policy, signal, image }) => invokeAnthropicJson({
  signal,
  body: {
    model: policy.model,
    max_tokens: policy.maxTokens,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: Buffer.from(image.bytes).toString('base64') } },
      { type: 'text', text: prompt },
    ] }],
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
  },
});

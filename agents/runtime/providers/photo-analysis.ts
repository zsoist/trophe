import { z } from 'zod';
import { AiProviderError } from './errors';
import type { AiUsage } from '../types';

export interface FoodAnalysis {
  name: string;
  estimated_grams: number;
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
  confidence: number;
  source?: 'ai_estimate';
  accuracy_note?: string;
}

const foodAnalysisSchema = z.object({
  name: z.string().min(1),
  estimated_grams: z.number().finite(),
  estimated_calories: z.number().finite(),
  estimated_protein_g: z.number().finite(),
  estimated_carbs_g: z.number().finite(),
  estimated_fat_g: z.number().finite(),
  confidence: z.number().finite(),
  source: z.literal('ai_estimate').optional(),
  accuracy_note: z.string().optional(),
});

interface ProviderEvidence {
  status?: number;
  providerRequestId?: string;
  providerGenerationId?: string;
  usage?: AiUsage;
  latencyMs?: number;
}

function protocolError(
  message: string,
  errorCode: string,
  evidence: ProviderEvidence,
): AiProviderError {
  return new AiProviderError({
    provider: 'anthropic',
    message,
    status: evidence.status,
    errorType: 'provider_protocol_error',
    errorCode,
    providerRequestId: evidence.providerRequestId,
    providerGenerationId: evidence.providerGenerationId,
    usage: evidence.usage,
    latencyMs: evidence.latencyMs,
  });
}

function isPlausible(food: FoodAnalysis): boolean {
  return food.estimated_grams > 0
    && food.estimated_grams <= 10_000
    && food.estimated_calories >= 0
    && food.estimated_calories <= 10_000
    && food.estimated_protein_g >= 0
    && food.estimated_carbs_g >= 0
    && food.estimated_fat_g >= 0
    && food.estimated_protein_g + food.estimated_carbs_g + food.estimated_fat_g
      <= food.estimated_grams * 1.15
    && food.confidence >= 0
    && food.confidence <= 1;
}

export function parsePhotoAnalysisOutput(
  output: unknown,
  evidence: ProviderEvidence,
): { foods: FoodAnalysis[]; droppedCount: number } {
  const root = output && typeof output === 'object' && !Array.isArray(output)
    ? output as Record<string, unknown>
    : {};
  const content = Array.isArray(root.content) ? root.content : [];
  const toolUse = content.find((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return false;
    const record = block as Record<string, unknown>;
    return record.type === 'tool_use' && record.name === 'submit_food_photo_analysis';
  }) as Record<string, unknown> | undefined;
  if (!toolUse) {
    throw protocolError('Anthropic photo response missing tool call', 'missing_tool_call', evidence);
  }

  const toolInput = toolUse.input && typeof toolUse.input === 'object' && !Array.isArray(toolUse.input)
    ? toolUse.input as Record<string, unknown>
    : {};
  const rawFoods = Array.isArray(toolInput.foods) ? toolInput.foods : [];
  const foods = rawFoods.flatMap((candidate) => {
    const parsed = foodAnalysisSchema.safeParse(candidate);
    return parsed.success && isPlausible(parsed.data) ? [parsed.data] : [];
  });
  if (foods.length === 0) {
    throw protocolError(
      'Anthropic photo response contained no valid nutrition items',
      'invalid_structured_output',
      evidence,
    );
  }
  return { foods, droppedCount: rawFoods.length - foods.length };
}

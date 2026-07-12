import { describe, expect, it } from 'vitest';
import { parsePhotoAnalysisOutput } from '@/agents/runtime/providers/photo-analysis';

const evidence = { status: 200, providerRequestId: 'req_photo_123' };

describe('photo analysis provider boundary', () => {
  it('returns only schema-valid, physically plausible foods', () => {
    const result = parsePhotoAnalysisOutput({
      content: [{
        type: 'tool_use',
        name: 'submit_food_photo_analysis',
        input: {
          foods: [
            {
              name: 'grilled chicken', estimated_grams: 150, estimated_calories: 250,
              estimated_protein_g: 40, estimated_carbs_g: 0, estimated_fat_g: 8,
              confidence: 0.7, source: 'ai_estimate', accuracy_note: 'portion estimated',
            },
            {
              name: 'impossible oil', estimated_grams: 10, estimated_calories: 1_000,
              estimated_protein_g: 0, estimated_carbs_g: 0, estimated_fat_g: 100,
              confidence: 0.9, source: 'ai_estimate', accuracy_note: 'bad',
            },
          ],
        },
      }],
    }, evidence);

    expect(result.foods).toHaveLength(1);
    expect(result.droppedCount).toBe(1);
  });

  it('throws typed provider evidence for a missing tool result', () => {
    expect(() => parsePhotoAnalysisOutput({ content: [] }, evidence)).toThrowError(
      expect.objectContaining({
        name: 'AiProviderError',
        status: 200,
        errorType: 'provider_protocol_error',
        errorCode: 'missing_tool_call',
        providerRequestId: 'req_photo_123',
      }),
    );
  });

  it('throws before completion when every returned food is malformed or implausible', () => {
    expect(() => parsePhotoAnalysisOutput({
      content: [{
        type: 'tool_use',
        name: 'submit_food_photo_analysis',
        input: { foods: [{ name: 'broken', estimated_grams: -1 }] },
      }],
    }, evidence)).toThrowError(expect.objectContaining({
      errorCode: 'invalid_structured_output',
      providerRequestId: 'req_photo_123',
    }));
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  executeAiTask: vi.fn(),
  invokeAnthropicJson: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/runtime', () => ({ executeAiTask: mocks.executeAiTask }));
vi.mock('@/agents/runtime/providers/anthropic', () => ({
  invokeAnthropicJson: mocks.invokeAnthropicJson,
}));

import { POST } from '@/app/api/ai/photo-analyze/route';

function request() {
  return new NextRequest('http://localhost/api/ai/photo-analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'photo-1' },
    body: JSON.stringify({ imageBase64: 'aGVsbG8=', mediaType: 'image/jpeg' }),
  });
}

const rice = {
  name: 'White rice',
  estimated_grams: 180,
  estimated_calories: 234,
  estimated_protein_g: 4.3,
  estimated_carbs_g: 50.8,
  estimated_fat_g: 0.5,
  estimated_fiber_g: 0.7,
  estimated_sugar_g: 0.1,
  confidence: 0.68,
  source: 'ai_estimate',
  accuracy_note: 'Estimated from the plate.',
};

describe('POST /api/ai/photo-analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only-key');
    mocks.guardAiRoute.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      rateLimitBypassed: false,
    });
    mocks.executeAiTask.mockResolvedValue({
      output: {
        content: [{
          type: 'tool_use',
          name: 'submit_food_photo_analysis',
          input: { dish_name: 'Bandeja Paisa', foods: [rice] },
        }],
      },
    });
  });

  it('uses one governed call and returns a conservative editable Beans row', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.executeAiTask).toHaveBeenCalledTimes(1);
    expect(mocks.executeAiTask).toHaveBeenCalledWith(expect.objectContaining({
      task: 'photo_analyze',
      prompt: expect.stringContaining('Bandeja Paisa'),
    }));
    expect(body.foods.find((food: { name: string }) => food.name === 'Beans')).toMatchObject({
      estimated_grams: 120,
      estimated_fiber_g: 7.7,
      needs_confirmation: true,
    });
    expect(mocks.invokeAnthropicJson).not.toHaveBeenCalled();
  });
});

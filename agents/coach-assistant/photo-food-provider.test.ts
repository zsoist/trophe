import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LUNA_MODEL, HAIKU_MODEL, taskPolicies } from '@/agents/router/policies';
import { invokePrivatePhotoFoodProvider } from './photo-food-provider';

const mocks = vi.hoisted(() => ({ invokeOpenAiStructured: vi.fn() }));
vi.mock('@/agents/runtime/providers/openai', () => ({ invokeOpenAiStructured: mocks.invokeOpenAiStructured }));

const image = { bytes: Uint8Array.from([1, 2, 3]), mediaType: 'image/jpeg' as const };
const foods = [{
  identity_status: 'identified', name: 'Rice', estimated_grams: 100, estimated_calories: 130, estimated_protein_g: 2.7,
  estimated_carbs_g: 28, estimated_fat_g: 0.3, estimated_fiber_g: 0.4, estimated_sugar_g: 0,
  confidence: 0.7, source: 'ai_estimate' as const, accuracy_note: 'Estimate; confirm grams.',
}];

describe('Luna Photo Food provider', () => {
  beforeEach(() => mocks.invokeOpenAiStructured.mockReset());
  it('uses the structured Luna adapter and preserves the observation tool shape', async () => {
    mocks.invokeOpenAiStructured.mockResolvedValueOnce({
      responseModel: LUNA_MODEL, output: { dish_name: 'Rice plate', foods }, usage: { inputTokens: 10, outputTokens: 8 },
      latencyMs: 2, rawStatus: 200,
    });
    const result = await invokePrivatePhotoFoodProvider({ policy: taskPolicies.photo_analyze, signal: new AbortController().signal, image });
    expect(mocks.invokeOpenAiStructured).toHaveBeenCalledWith(expect.objectContaining({
      model: LUNA_MODEL, strict: true, maxAttempts: 1, store: false, image,
    }));
    expect(result.output).toEqual({ content: [{ type: 'tool_use', name: 'submit_food_photo_analysis', input: { dish_name: 'Rice plate', foods } }] });
    const effective = mocks.invokeOpenAiStructured.mock.calls[0][0].system;
    const call = mocks.invokeOpenAiStructured.mock.calls[0][0];
    expect(call.schema.properties.foods.items.required).toContain('identity_status');
    for (const identity_status of [undefined, 'unassessed', 'confirmed']) {
      expect(call.validator.safeParse({dish_name:'',foods:[{...foods[0],identity_status}]}).success).toBe(false);
    }
    expect(call.validator.safeParse({dish_name:'',foods:[{...foods[0],identity_status:'uncertain',name:'Pale oval pieces',accuracy_note:'Could be fruit or vegetable; please clarify.'}]}).success).toBe(true);
    expect(taskPolicies.photo_analyze.promptVersion).toBe('photo-analyze-v3');
    expect(effective).not.toMatch(/Bandeja Paisa|reasonably identify/);
    expect(effective).toContain('Identity uncertainty and portion-weight uncertainty are separate');
    expect(effective).toContain('name` must describe visible appearance');
  });

  it('fails closed for a legacy Anthropic policy without invoking a provider', async () => {
    await expect(invokePrivatePhotoFoodProvider({
      policy: { ...taskPolicies.photo_analyze, provider: 'anthropic', model: HAIKU_MODEL },
      signal: new AbortController().signal, image,
    })).rejects.toThrow('budget_blocked');
    expect(mocks.invokeOpenAiStructured).not.toHaveBeenCalled();
  });
});

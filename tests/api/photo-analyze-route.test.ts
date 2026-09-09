import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  executeAiTask: vi.fn(),
  invokeAnthropicJson: vi.fn(),
  createPilotBudgetStore: vi.fn(()=>({execute:vi.fn()})),
  createSharedPilotBudgetRuntime: vi.fn(()=>({ok:true,pilotId:'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229',store:{execute:vi.fn()}})),
  runGovernedPilotModality: vi.fn(async(input:{run:()=>Promise<unknown>})=>input.run()),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/runtime', () => ({ executeAiTask: mocks.executeAiTask }));
vi.mock('@/agents/runtime/providers/anthropic', () => ({
  invokeAnthropicJson: mocks.invokeAnthropicJson,
}));
vi.mock('@/db/client',()=>({db:{}}));
vi.mock('@/lib/workout/pilot-budget-service',()=>({createPilotBudgetStore:mocks.createPilotBudgetStore}));
vi.mock('@/lib/workout/shared-pilot-budget',()=>({createSharedPilotBudgetRuntime:mocks.createSharedPilotBudgetRuntime}));
vi.mock('@/agents/coach-assistant/governed-modality',()=>({runGovernedPilotModality:mocks.runGovernedPilotModality}));

import { POST } from '@/app/api/ai/photo-analyze/route';

function request() {
  return new NextRequest('http://localhost/api/ai/photo-analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'photo-1' },
    body: JSON.stringify({ imageBase64: 'aGVsbG8=', mediaType: 'image/jpeg' }),
  });
}
function pilotRequest() {return new NextRequest('http://localhost/api/ai/photo-analyze',{method:'POST',headers:{'content-type':'application/json','x-request-id':'photo-1','x-coach-conversation-id':'00000000-0000-4000-8000-000000000002','x-coach-turn-id':'00000000-0000-4000-8000-000000000003'},body:JSON.stringify({imageBase64:'aGVsbG8=',mediaType:'image/jpeg'})});}

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
  afterEach(()=>vi.unstubAllEnvs());
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
  it('routes a preview pilot photo through the shared durable modality admission',async()=>{
    const actor='00000000-0000-4000-8000-000000000001';mocks.guardAiRoute.mockResolvedValue({ok:true,userId:actor,rateLimitBypassed:false});
    vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('COACH_ASSISTANT_ENABLED','1');vi.stubEnv('COACH_ASSISTANT_LIVE_PILOT_ENABLED','1');vi.stubEnv('TROPHE_ALLOW_PAID_AI','1');vi.stubEnv('COACH_ASSISTANT_PREVIEW_USER_IDS',actor);vi.stubEnv('OPENAI_API_KEY','test');
    expect((await POST(pilotRequest())).status).toBe(200);
    expect(mocks.runGovernedPilotModality).toHaveBeenCalledWith(expect.objectContaining({task:'photo_analyze',actorId:actor,turnId:'00000000-0000-4000-8000-000000000003'}));
    expect(mocks.executeAiTask).toHaveBeenCalledOnce();
  });
});

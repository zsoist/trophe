import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  run: vi.fn(),
  tryLocalFoodParse: vi.fn(),
  gate: vi.fn(() => ({ok:true,pilotId:'pilot',store:{}})),
  transport: vi.fn(),
  provider: vi.fn(),
  complete: vi.fn(),
  annotateGenerationMetadata: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/food-parse', () => ({ run: mocks.run, tryLocalFoodParse: mocks.tryLocalFoodParse }));
vi.mock('@/agents/runtime/persistence', () => ({
  annotateGenerationMetadata: mocks.annotateGenerationMetadata,
}));

vi.mock('@/db/client',()=>({db:{}}));
vi.mock('@/lib/workout/pilot-budget-service',()=>({createPilotBudgetStore:vi.fn(()=>({}))}));
vi.mock('@/lib/workout/shared-pilot-budget',()=>({createSharedPilotBudgetRuntime:mocks.gate}));
vi.mock('@/agents/coach-assistant/governed-transport',()=>({createGovernedCoachTransport:mocks.transport}));
vi.mock('@/agents/runtime/providers/structured',()=>({invokeStructuredProvider:vi.fn()}));
vi.mock('@/agents/coach-assistant/text-food-parser',()=>({TEXT_FOOD_PROMPT_VERSION:'test-food',createTextFoodParserTransport:()=>({providerTransport:mocks.provider,assertComplete:mocks.complete})}));
afterEach(()=>vi.unstubAllEnvs());

import { POST } from '@/app/api/food/parse/route';

function request(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/food/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/food/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryLocalFoodParse.mockResolvedValue(null);
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1', rateLimitBypassed: false });
    mocks.annotateGenerationMetadata.mockResolvedValue(undefined);
  });

  it('coerces unknown languages to English instead of rejecting', async () => {
    // Language is a prompt hint only — hard-400s on it/de/nl/pt caused 18
    // benchmark failures before the enum was widened + .catch('en') added.
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200 },
    });
    const response = await POST(request({ text: 'one egg', language: 'zh' }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
  });

  it('accepts the full 8-language UI set', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'Brot' }] },
      telemetry: { rawStatus: 200 },
    });
    const response = await POST(request({ text: 'eine Scheibe Brot', language: 'de' }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'eine Scheibe Brot', language: 'de' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
  });

  it('rejects inputs above the governed parser ceiling', async () => {
    const response = await POST(request({ text: 'x'.repeat(12_001), language: 'en' }));
    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('passes normalized supported input to the parser', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200 },
    });
    const response = await POST(request({ text: '  one egg  ', language: 'en' }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
  });

  it('maps raw pipeline failures to stable user-safe error codes', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'DeepSeek incomplete response (length)',
      telemetry: { rawStatus: 502, model: 'm', traceId: 'generation-malformed' },
    });
    const response = await POST(request({ text: 'one egg', language: 'en' }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.code).toBe('ai_busy');
    expect(body.message).not.toContain('DeepSeek');
    expect(body.error).not.toContain('DeepSeek');
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-malformed', {
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'malformed',
    });
  });

  it('maps over-long input to the too_long code', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'Input too long (720 characters, max 500)',
      errorCode: 'too_long',
      telemetry: { rawStatus: 0, model: 'm', traceId: null },
    });
    const response = await POST(request({ text: 'long input', language: 'en' }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe('too_long');
  });

  it('maps plausibility failures to try_rephrase', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'Nutrition result failed plausibility validation',
      telemetry: { rawStatus: 200, model: 'm', traceId: null },
    });
    const response = await POST(request({ text: 'one egg', language: 'en' }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe('try_rephrase');
    expect(body.message).not.toContain('plausibility');
  });

  it('accepts canary segmentation only from a rate-limit-bypassed eval identity', async () => {
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'eval-user', rateLimitBypassed: true });
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200, traceId: 'generation-1' },
    });

    const response = await POST(request(
      { text: 'one egg', language: 'en' },
      { 'x-trophe-eval-suite': 'phase3-luna-watchlist', 'x-request-id': 'watch-1' },
    ));

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, {
      userId: 'eval-user',
      requestId: 'watch-1',
      metadata: { evalSuite: 'phase3-luna-watchlist', canarySegment: 'consumer-luna-week-1' },
      maxProviderAttempts: 1,
      onGenerationId: expect.any(Function),
    });
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-1', {
      evalSuite: 'phase3-luna-watchlist',
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'success',
    });
  });

  it('ignores canary headers from ordinary users', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200, traceId: 'generation-2' },
    });

    await POST(request(
      { text: 'one egg', language: 'en' },
      { 'x-trophe-eval-suite': 'phase3-luna-watchlist' },
    ));

    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-2', {
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'success',
    });
  });

  it('records malformed when post-provider processing throws after generation creation', async () => {
    mocks.run.mockImplementationOnce(async (_input, opts) => {
      opts.onGenerationId('generation-postprocess');
      throw new Error('lookup failed after provider success');
    });

    const response = await POST(request({ text: 'one egg', language: 'en' }));

    expect(response.status).toBe(500);
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-postprocess', {
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'malformed',
    });
  });
});


it.each(['production','preview'])('admits deployed %s Food through shared per-phase transport', async environment => {
 vi.stubEnv('VERCEL_ENV',environment);
 mocks.guardAiRoute.mockResolvedValue({ok:true,userId:'actor',rateLimitBypassed:false});
 mocks.transport.mockReturnValue({transport:mocks.provider});
 mocks.run.mockResolvedValue({ok:true,output:{items:[]},telemetry:{rawStatus:200}});
 const response=await POST(request({text:'egg',language:'en'},{'x-request-id':'00000000-0000-4000-8000-000000000003'}));
 expect(response.status).toBe(200);
 expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({turnId:'00000000-0000-4000-8000-000000000003',reservationProfile:'food_parse'}));
 expect(mocks.run).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({providerTransport:mocks.provider,maxProviderAttempts:1,allowSchemaRepair:false}));
 expect(mocks.complete).toHaveBeenCalled();
});
it('uses the deterministic catalogue after an admitted provider failure without a retry', async () => {
 vi.clearAllMocks();vi.stubEnv('VERCEL_ENV','production');
 mocks.guardAiRoute.mockResolvedValue({ok:true,userId:'actor',rateLimitBypassed:false});
 mocks.transport.mockReturnValue({transport:mocks.provider});
 mocks.run.mockResolvedValue({
   ok:false,
   error:'provider unavailable',
   telemetry:{rawStatus:502,model:'gpt-5.6-luna',traceId:'generation-provider-failed'},
 });
 mocks.tryLocalFoodParse.mockResolvedValueOnce({
   items:[{food_name:'McDONALD\'S, BIG MAC',quantity:1,unit:'piece'}],
   needs_clarification:false,
   clarification_question:null,
 });
 mocks.complete.mockImplementationOnce(() => { throw new Error('failed transport must not assert completion'); });

 const response=await POST(request({text:'1 Big Mac',language:'en'}));

 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({items:[{food_name:"McDONALD'S, BIG MAC"}]});
 expect(mocks.provider).not.toHaveBeenCalled();
 expect(mocks.complete).not.toHaveBeenCalled();
 expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-provider-failed', {
   canarySegment:'consumer-luna-week-1',
   localFallback:'catalogue_after_provider_failure',
   apiOutcome:'success',
 });
});
it('rejects denied deployed Food before invoking its parser', async()=>{
 vi.clearAllMocks();vi.stubEnv('VERCEL_ENV','production');
 mocks.guardAiRoute.mockResolvedValue({ok:true,userId:'actor',rateLimitBypassed:false});
 mocks.gate.mockReturnValueOnce({ok:false,pilotId:'',store:{}});
 expect((await POST(request({text:'egg',language:'en'}))).status).toBe(503);
 expect(mocks.run).not.toHaveBeenCalled();
});
it('keeps deterministic catalogue foods loggable when the paid pilot is denied', async()=>{
 vi.clearAllMocks();vi.stubEnv('VERCEL_ENV','production');
 mocks.guardAiRoute.mockResolvedValue({ok:true,userId:'actor',rateLimitBypassed:false});
 mocks.gate.mockReturnValueOnce({ok:false,pilotId:'',store:{}});
 mocks.tryLocalFoodParse.mockResolvedValueOnce({
   items:[{food_name:'McDONALD\'S, BIG MAC',quantity:1,unit:'piece'}],
   needs_clarification:false,
   clarification_question:null,
 });
 const response=await POST(request({text:'1 Big Mac',language:'en'}));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({items:[{food_name:"McDONALD'S, BIG MAC"}]});
 expect(mocks.run).not.toHaveBeenCalled();
 expect(mocks.tryLocalFoodParse).toHaveBeenCalledWith({text:'1 Big Mac',language:'en'});
});

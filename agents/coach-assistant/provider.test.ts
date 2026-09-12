import { describe, expect, it } from 'vitest';
import { invokeOfflineCoachModel } from './provider';
import { priceCoachUsage } from './economics';
import { taskPolicies, taskFallbacks } from '@/agents/router/policies';

describe('isolated Luna configuration and accounting', () => {
  it.each(['none','low','medium'] as const)('sends %s with one attempt and bounded completion including reasoning', async effort => {
    let body: Record<string, unknown> = {};
    const result = await invokeOfflineCoachModel({system:'Rules',prompt:'Synthetic facts',signal:new AbortController().signal,effort,
      fetchImpl:async (_url, init)=>{ body=JSON.parse(String(init?.body)); return new Response(JSON.stringify({
        id:'offline-generation',status:'completed',output:[{type:'reasoning',summary:[]},{type:'function_call',status:'completed',name:'select_coach_evidence',arguments:JSON.stringify({factIds:[],suggestionCodes:[],escalate:false})}],
        usage:{input_tokens:2000,output_tokens:500,input_tokens_details:{cached_tokens:1000,cache_write_tokens:500},output_tokens_details:{reasoning_tokens:300}},
      }),{status:200,headers:{'x-request-id':'req_offline_fixture'}}); } });
    expect(body.reasoning).toEqual({ effort });
    expect(body.max_output_tokens).toBe(2000);
    expect(body.store).toBe(false);
    expect(result.requestId).toBe('req_offline_fixture');
    expect(priceCoachUsage(result.usage)).toBeCloseTo(.000845,10);
  });
  it('keeps the coach task narrowly bounded in the Luna lane without fallbacks', () => {
    expect(taskPolicies.coach_assistant.maxCostUsd).toBe(0.0044);
    expect(taskPolicies.coach_assistant.reasoningEffort).toBe('low');
    expect(taskPolicies.coach_insight.provider).toBe('openai');
    expect(taskPolicies.memory_extract.provider).toBe('openai');
    expect(taskFallbacks.coach_assistant).toBeUndefined();
  });
  it('never treats absent or invalid usage as free', () => {
    expect(priceCoachUsage({inputTokens:0,outputTokens:0})).toBeNull();
    expect(priceCoachUsage({inputTokens:10,outputTokens:5,reasoningTokens:6})).toBeNull();
  });
});

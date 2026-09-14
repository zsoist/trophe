import { expect, it, vi } from 'vitest';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import { createCoachCapabilityRegistry } from './capability-registry';
import type { OfflineConversationProvider } from './open-conversation';

it('sends an object-root function schema and unwraps a validated capability choice', async () => {
  const id = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const repository = fixtureRepository({ nutrition: [], workouts: [], plans: [] });
  repository.authorize = async () => ({ actorId:id(1),subjectId:id(1),organizationId:id(2),timezone:'UTC',language:'en' });
  const lookup = vi.fn(async () => null);
  const provider: OfflineConversationProvider = async input => {
    expect(input.schema).toMatchObject({ type:'object',additionalProperties:false,required:['choice'] });
    expect(input.schema).not.toHaveProperty('anyOf');
    expect(input.schema).not.toHaveProperty('oneOf');
    const output = input.validator.parse({ choice:{tool:'food.reference',args:{queries:['Big Macs']}} });
    expect(output).toEqual({tool:'food.reference',args:{queries:['Big Macs']}});
    expect(input.validator.safeParse({choice:{tool:'food.reference',args:{queries:['a','b','c']}}}).success).toBe(false);
    return {output,usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1};
  };
  const result = await runConversation({version:'coach-assistant.v2',conversationId:id(3),turnId:id(4),message:'Macros in two Big Macs?'},{actorId:id(1),repository,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({foodReference:lookup}),signal:new AbortController().signal,now:new Date('2026-09-12T12:00:00Z')});
  expect(result.ok,JSON.stringify(result.error)).toBe(true);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(result.receipts).toEqual([]);
});

import { describe, expect, it, vi } from 'vitest';
import { runDurableChatTurn } from './chat-turn';
import { fixtureRepository } from './fixtures';
import { readVerifiedChatFinal } from './chat-final';
import type { createCoachChatService } from './chat-service';
import type { CoachConversationRequest } from './contracts';

function setup() {
  const actor = crypto.randomUUID(), org = crypto.randomUUID();
  const request: CoachConversationRequest = { version: 'coach-assistant.v2', conversationId: crypto.randomUUID(), turnId: crypto.randomUUID(), message: 'Review my day' };
  const empty = vi.fn(async () => ({ rows: [], truncated: false }));
  const repository = { ...fixtureRepository(), dataSource: 'authorized_records' as const, authorize: async () => ({ actorId: actor, subjectId: actor, organizationId: org, timezone: 'UTC', language: 'en' }), nutrition: empty, plan: empty, workouts: empty, exercise: empty, personalContext: empty };
  const options = { actorId: actor, repository, now: new Date('2026-09-07T03:30:00Z'), signal: new AbortController().signal, mode: 'offline' as const };
  const execute = vi.fn(async () => ({ version: 'coach-assistant.chat.v1', storage: 'database', ok: true, value: { message: {}, replayed: false, current: true } }));
  const appendFinal = vi.fn(async () => ({ ok: true }));
  const markFailed = vi.fn(async () => ({ ok: true }));
  // Service port double; the final proof comes from the actual offline pipeline.
  const service = { execute, appendFinal, markFailed } as unknown as ReturnType<typeof createCoachChatService>;
  return { request, options, service, execute, appendFinal, markFailed, empty };
}
describe('durable turn orchestration', () => {
  it('persists the exact verified answer after the user turn, once', async () => {
    const f = setup();
    const result = await runDurableChatTurn(f.request, f.options, f.service);
    expect(result.saved).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.appendFinal).toHaveBeenCalledTimes(1);
    const proof = (f.appendFinal.mock.calls as unknown[][])[0][2];
    expect(readVerifiedChatFinal(proof as Parameters<typeof readVerifiedChatFinal>[0])?.text).toBe(result.saved ? result.response.output?.answer : undefined);
    expect(f.execute.mock.invocationCallOrder[0]).toBeLessThan(f.appendFinal.mock.invocationCallOrder[0]);
  });
  it('does not generate or append an answer when the user claim is a replay', async () => {
    const f = setup();
    f.execute.mockResolvedValue({ version: 'coach-assistant.chat.v1', storage: 'database', ok: true, value: { message: {}, replayed: true, current: true } });
    expect(await runDurableChatTurn(f.request, f.options, f.service)).toEqual({ saved: false });
    expect(f.empty).not.toHaveBeenCalled(); expect(f.appendFinal).not.toHaveBeenCalled();
  });
  it('does not report success when final persistence is uncertain', async () => {
    const f = setup(); f.appendFinal.mockResolvedValue({ ok: false });
    expect(await runDurableChatTurn(f.request, f.options, f.service)).toEqual({ saved: false });
  });
  it('marks a conclusive failed generation but leaves an aborted claim inflight',async()=>{
    const failed=setup();
    const terminal=await runDurableChatTurn(failed.request,{...failed.options,mode:'model'},failed.service);
    expect(terminal.saved).toBe(true);expect(terminal.saved&&terminal.response.error?.code).toBe('budget_blocked');expect(failed.markFailed).toHaveBeenCalledTimes(1);
    const aborted=setup(),controller=new AbortController();controller.abort();
    const uncertain=await runDurableChatTurn(aborted.request,{...aborted.options,signal:controller.signal},aborted.service);
    expect(uncertain.saved).toBe(true);expect(aborted.markFailed).not.toHaveBeenCalled();expect(aborted.appendFinal).not.toHaveBeenCalled();
  });
  it('rejects a different subject before any storage or generation', async () => {
    const f = setup();
    await expect(runDurableChatTurn({ ...f.request, context: { surface: 'home', clientId: crypto.randomUUID(), includeScreen: false } }, f.options, f.service)).rejects.toThrow('forbidden');
    expect(f.execute).not.toHaveBeenCalled(); expect(f.empty).not.toHaveBeenCalled();
  });
});

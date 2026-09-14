import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationController, type ConversationTransport } from '@/components/assistant/conversation-state';
import { TEXT_FOOD_CLIENT_DEADLINE_MS, TEXT_FOOD_SERVER_DEADLINE_MS } from '@/agents/coach-assistant/text-food-deadline';
afterEach(()=>vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const controller=new ConversationController();controller.identify('actor');
  controller.restore(crypto.randomUUID(),[]);controller.setDraft('I just ate 100g rice');
  let resolve!: (value: Awaited<ReturnType<ConversationTransport>>) => void;
  let signal!:AbortSignal;
  const transport=vi.fn<ConversationTransport>(async(_request,current)=>{signal=current;return new Promise(done=>{resolve=done;});});
  const pending=controller.send({surface:'food',includeScreen:true},transport);
  const request=controller.snapshot().turns[0].request;
  const response={conversationId:request.conversationId,turnId:request.turnId,ok:true,textFood:{ok:true,draft:{id:request.turnId}},output:{answer:'Review your meal before confirming.'}} as Awaited<ReturnType<ConversationTransport>>;
  return {controller,transport,pending,signal:()=>signal,resolve:()=>resolve(response)};
}
describe('Text Food end-to-end client deadline',()=>{
  it('accepts a review after45s within server budget with one dispatch and one turn',async()=>{
    const f=fixture();await vi.advanceTimersByTimeAsync(60_000);
    expect(TEXT_FOOD_CLIENT_DEADLINE_MS).toBeGreaterThan(TEXT_FOOD_SERVER_DEADLINE_MS);
    expect(f.signal().aborted).toBe(false);expect(f.controller.snapshot()).toMatchObject({pending:true,recoveryRequired:false});
    f.resolve();await f.pending;
    expect(f.controller.snapshot()).toMatchObject({pending:false,recoveryRequired:false,error:null});
    expect(f.controller.snapshot().turns[0].response?.textFood).toBeDefined();
    expect(f.controller.snapshot().turns).toHaveLength(1);expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it('times out at the actual client ceiling and rejects a late result without resending',async()=>{
    const f=fixture();await vi.advanceTimersByTimeAsync(TEXT_FOOD_CLIENT_DEADLINE_MS);
    expect(f.signal().aborted).toBe(true);expect(f.controller.snapshot()).toMatchObject({pending:false,recoveryRequired:true,error:'failed'});
    f.resolve();await f.pending;expect(f.controller.snapshot().turns[0].response).toBeUndefined();
    await f.controller.send({surface:'food',includeScreen:true},f.transport);expect(f.transport).toHaveBeenCalledTimes(1);expect(f.controller.snapshot().turns).toHaveLength(1);
  });
  it('preserves the existing shorter deadline for ordinary text questions',async()=>{
    vi.useFakeTimers();const controller=new ConversationController();controller.identify('actor');controller.setDraft('What is my plan?');
    let done!:(value:Awaited<ReturnType<ConversationTransport>>)=>void;let signal!:AbortSignal;
    const pending=controller.send(undefined,async(_request,s)=>{signal=s;return new Promise(resolve=>{done=resolve;});});
    await vi.advanceTimersByTimeAsync(45_000);expect(signal.aborted).toBe(true);done({} as Awaited<ReturnType<ConversationTransport>>);await pending;
  });
});

import { expect, it, vi } from 'vitest';
import { ConversationController, coachSurface, professionalCoachSubject, type ConversationTransport } from '@/components/assistant/conversation-state';

it('maps the five professional routes and extracts only explicit client route hints', () => {
 expect(coachSurface('/coach/inbox/client-a')).toBe('messages');
 expect(coachSurface('/coach/questionnaires')).toBe('intake');
 expect(coachSurface('/coach/calendar')).toBe('booking');
 expect(coachSurface('/coach/protocols')).toBe('supplements');
 expect(coachSurface('/coach/client/client-a/form-check')).toBe('form_check');
 expect(professionalCoachSubject('/coach/client/client-a')).toBe('client-a');
 expect(professionalCoachSubject('/coach/inbox/client-b')).toBe('client-b');
 expect(professionalCoachSubject('/coach/inbox')).toBeUndefined();
 expect(professionalCoachSubject('/coach/client/client-a/plan?client=client-b')).toBe('client-a');
});

it('navigation hints are snapshotted and identity changes suppress late output',async()=>{
 const controller=new ConversationController();controller.identify('actor-a');controller.setDraft('A private question');
 let resolve!:(value: Awaited<ReturnType<ConversationTransport>>) => void;
 let signal:AbortSignal|undefined;
 const transport:ConversationTransport=async(_request,s)=>{signal=s;return new Promise(r=>{resolve=r;});};
 const context={surface:'food' as const,includeScreen:true};
 const pending=controller.send(context,transport);context.includeScreen=false;
 expect(controller.snapshot().turns[0].request.context?.includeScreen).toBe(true);
 const old=controller.snapshot().turns[0].request;controller.identify('actor-b');
 expect(signal?.aborted).toBe(true);expect(controller.snapshot().turns).toEqual([]);expect(controller.snapshot().draft).toBe('');
 resolve({conversationId:old.conversationId,turnId:old.turnId,ok:true} as Awaited<ReturnType<ConversationTransport>>);await pending;
 expect(controller.snapshot().turns).toEqual([]);
});

it('draft edits and context calculation do not dispatch; cancel preserves text',async()=>{
 const controller=new ConversationController();controller.identify('actor');controller.setDraft('Keep this question');
 let calls=0;let resolve!:(value:Awaited<ReturnType<ConversationTransport>>)=>void;
 const transport:ConversationTransport=async()=>{calls++;return new Promise(r=>{resolve=r;});};
 expect(calls).toBe(0);const pending=controller.send({surface:'workout',includeScreen:false},transport);
 await controller.send({surface:'food',includeScreen:true},transport);expect(calls).toBe(1);
 controller.cancel();expect(controller.snapshot().draft).toBe('Keep this question');
 resolve({} as Awaited<ReturnType<ConversationTransport>>);await pending;expect(controller.snapshot().error).toBe('cancelled');
});

it('forwards the exact signed answer snippet and drops its history on identity change', async () => {
 const {createDerivedHistoryBinding}=await import('@/agents/coach-assistant/derived-history');
 const controller=new ConversationController();controller.identify('actor');controller.setDraft('First question');
 const authorized={actorId:'actor',subjectId:'actor',organizationId:'org',timezone:'UTC',language:'en'};
 const transport:ConversationTransport=async request=>{
  const result={version:'coach-assistant.v2',conversationId:request.conversationId,turnId:request.turnId,ok:true,output:{answer:'A'.repeat(600)}} as Awaited<ReturnType<ConversationTransport>>;
  const binding=createDerivedHistoryBinding(request.conversationId);binding.capture(authorized,'current-memory-and-diet');binding.finish(result);return result;
 };
 await controller.send({surface:'workout',includeScreen:true},transport);
 controller.setDraft('Follow up');
 await controller.send({surface:'atlas',includeScreen:true},async request=>{
  const binding=createDerivedHistoryBinding(request.conversationId);binding.capture(authorized,'current-memory-and-diet');
  expect(request.history?.[1].text).toBe('A'.repeat(500));
  expect(binding.filterHistory(request).history).toHaveLength(2);
  binding.capture(authorized,'changed-memory-or-diet');
  expect(binding.filterHistory(request).history).toEqual([{role:'user',text:'First question'}]);
  return transport(request,new AbortController().signal);
 });
 controller.identify('different-actor');controller.setDraft('New account');
 await controller.send(undefined,async request=>{expect(request.history).toEqual([]);return transport(request,new AbortController().signal);});
});

it('restores transcript without fabricating live output and clears it on account change', async () => {
 const controller = new ConversationController(); controller.identify('actor');
 const threadId = crypto.randomUUID();
 const messages = [{ id: crypto.randomUUID(), turnId: crypto.randomUUID(), role: 'assistant' as const, text: 'Historical answer', sequence: 2, revision: crypto.randomUUID(), createdAt: new Date().toISOString() }];
 expect(controller.restore(threadId, messages)).toBe(true);
 messages[0].text = 'Mutated outside';
 expect(controller.snapshot().restored[0].text).toBe('Historical answer');
 expect(controller.snapshot().turns).toEqual([]);
 controller.setDraft('Continue');
 await controller.send(undefined, async request => {
  expect(request.conversationId).toBe(threadId);
  expect(request.history).toEqual([{ role: 'assistant', text: 'Historical answer' }]);
  return { conversationId: request.conversationId, turnId: request.turnId, ok: false } as Awaited<ReturnType<ConversationTransport>>;
 });
 controller.identify('other-account');
 expect(controller.snapshot().restored).toEqual([]);
 expect(controller.snapshot().conversationId).not.toBe(threadId);
});

it('creates a durable thread before generation and requires recovery after response loss', async () => {
 const controller = new ConversationController(); controller.identify('actor'); controller.setDraft('Save this');
 const id = crypto.randomUUID(); let generations = 0;
 const create = async () => ({ id });
 await controller.send(undefined, async request => { generations++; expect(request.conversationId).toBe(id); throw new Error('lost response'); }, [], create);
 expect(controller.snapshot().durable).toBe(true);
 expect(controller.snapshot().recoveryRequired).toBe(true);
 await controller.send(undefined, async () => { generations++; throw new Error('must not send'); }, [], create);
 expect(generations).toBe(1);
 controller.restore(id, []);
 expect(controller.snapshot().recoveryRequired).toBe(false);
});

it('prepares one durable conversation before a voice transcript is bound to it', async () => {
 const controller = new ConversationController(); controller.identify('actor');
 const durableId = crypto.randomUUID(); const create = vi.fn(async () => ({ id: durableId }));
 await expect(controller.prepareDurable('Voice conversation', create)).resolves.toBe(durableId);
 expect(create).toHaveBeenCalledWith(expect.any(String), 'Voice conversation', expect.any(AbortSignal));
 expect(controller.snapshot()).toMatchObject({ conversationId: durableId, durable: true, pending: false, error: null });
 await expect(controller.prepareDurable('Ignored title', create)).resolves.toBe(durableId);
 expect(create).toHaveBeenCalledTimes(1);
});

it('retains the creation id and title after an uncertain create, without generating', async () => {
 const controller = new ConversationController(); controller.identify('actor'); controller.setDraft('First title');
 const calls: string[][] = []; let generations = 0;
 const create = async (id: string, title: string) => { calls.push([id, title]); throw new Error('lost create response'); };
 const transport: ConversationTransport = async () => { generations++; throw new Error('unexpected'); };
 await controller.send(undefined, transport, [], create);
 controller.setDraft('Edited message');
 await controller.send(undefined, transport, [], create);
 expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]); expect(generations).toBe(0);
});

it('starts a separate conversation and suppresses a late response from the previous one', async () => {
 const controller = new ConversationController(); controller.identify('actor'); controller.setDraft('Previous');
 let resolve!: (value: Awaited<ReturnType<ConversationTransport>>) => void;
 const before = controller.snapshot().conversationId;
 const sending = controller.send(undefined, async () => new Promise(done => { resolve = done; }));
 expect(controller.startNew()).toBe(true);
 const after = controller.snapshot().conversationId;
 expect(after).not.toBe(before); expect(controller.snapshot().draft).toBe('');
 resolve({ conversationId: before, turnId: crypto.randomUUID(), ok: true } as Awaited<ReturnType<ConversationTransport>>);
 await sending;
 expect(controller.snapshot().conversationId).toBe(after);
 expect(controller.snapshot().turns).toEqual([]); expect(controller.snapshot().restored).toEqual([]);
 expect(controller.snapshot().durable).toBe(false);
});

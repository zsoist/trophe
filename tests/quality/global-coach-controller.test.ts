import { expect, it } from 'vitest';
import { ConversationController, type ConversationTransport } from '@/components/assistant/conversation-state';

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

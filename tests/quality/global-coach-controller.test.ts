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

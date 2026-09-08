import {describe,expect,it,vi} from 'vitest';
import {executeCoachMessageAction,type CoachMessageService} from './message-actions';
import {fixtureRepository} from './fixtures';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),coach=id(2),conversationId=id(3),turnId=id(4),proposalId=id(5),actionId=id(6),org=id(7);
const base={version:'coach-assistant.v2' as const,conversationId,turnId};
const apply={...base,operation:'message.apply' as const,coachId:coach,proposalId,hash:'a'.repeat(64),resourceVersion:'1',actionId,reviewed:true as const};
const applied={ok:true as const,receipt:{id:id(8),actionId,proposalId,messageId:proposalId,coachId:coach,status:'stored' as const,recordedAt:'2026-09-08T12:00:00Z'},refresh:{coachId:coach,clientId:actor,strategy:'refetch' as const}};
function fixture(result:Awaited<ReturnType<CoachMessageService['execute']>>=applied){const repository=fixtureRepository();repository.dataSource='authorized_records';repository.authorize=vi.fn().mockResolvedValue({actorId:actor,subjectId:actor,organizationId:org,timezone:'UTC',language:'es'});const service:CoachMessageService={execute:vi.fn().mockResolvedValue(result)};return {repository,service,signal:new AbortController().signal};}
describe('human message action boundary',()=>{
 it('returns uncertain when authorization changes after a stored receipt',async()=>{const f=fixture();vi.mocked(f.repository.authorize).mockResolvedValueOnce({actorId:actor,subjectId:actor,organizationId:org,timezone:'UTC',language:'es'}).mockResolvedValueOnce({actorId:actor,subjectId:actor,organizationId:id(9),timezone:'UTC',language:'es'});expect(await executeCoachMessageAction(actor,apply,f.repository,f.service,f.signal)).toEqual({ok:false,error:'uncertain'});expect(f.service.execute).toHaveBeenCalledOnce();});
 it('rejects a receipt or proposal that is not bound to the requested operation',async()=>{const f=fixture({...applied,receipt:{...applied.receipt,coachId:id(9)}});expect(await executeCoachMessageAction(actor,apply,f.repository,f.service,f.signal)).toEqual({ok:false,error:'uncertain'});});
});

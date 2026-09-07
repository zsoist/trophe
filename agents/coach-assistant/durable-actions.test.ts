import { describe,it,expect,vi } from 'vitest';
import { executeDurablePreferenceAction, type DurableCoachActionService } from './durable-actions';
import { fixtureRepository } from './fixtures';
const actor='a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const id='aac3a82e-898c-4907-b9b9-75133bb6d27f';
const operation={version:'coach-assistant.v2',operation:'apply',conversationId:id,turnId:id,proposalId:id,hash:'a'.repeat(64),resourceVersion:'revision:1',actionId:id};
const receipt={id,actionId:id,proposalId:id,status:'applied',resourceVersion:'revision:2',recordedAt:'2026-09-07T00:00:00Z'};
const answer={version:'coach-assistant.v2',ok:true,storage:'database',receipt};
function fixture(execute=vi.fn<DurableCoachActionService['execute']>().mockResolvedValue(answer)) {
  const repository=fixtureRepository();repository.dataSource='authorized_records';
  repository.authorize=vi.fn().mockResolvedValue({actorId:actor,subjectId:actor,organizationId:'verified-org',timezone:'UTC',language:'en'});
  const abort=new AbortController();
  return {repository,service:{execute},abort};
}
describe('durable preference adapter with injected service (not database evidence)',()=>{
  it('validates the reviewed proposal binding and preserves an explicit transaction authorization refusal',async()=>{
    const proposed={version:operation.version,operation:'propose',conversationId:id,turnId:id,action:'preference.update',resourceVersion:'revision:1',after:{durationMinutes:45}};
    const proposal={id,hash:'a'.repeat(64),action:'preference.update',resource:{kind:'preference',id:actor,version:'revision:1'},before:{durationMinutes:30},after:{durationMinutes:45},precondition:'revision:1',expiresAt:'2026-09-07T01:00:00Z',reviewRequired:true};
    const {repository,service,abort}=fixture(vi.fn().mockResolvedValue({version:operation.version,ok:true,storage:'database',proposal}));
    expect((await executeDurablePreferenceAction(actor,proposed,repository,service,abort.signal)).proposal).toEqual(proposal);
    service.execute.mockResolvedValue({version:operation.version,ok:true,storage:'database',proposal:{...proposal,after:{durationMinutes:60}}});
    expect((await executeDurablePreferenceAction(actor,proposed,repository,service,abort.signal)).error).toBe('uncertain');
    service.execute.mockResolvedValue({version:operation.version,ok:false,storage:'database',error:'forbidden'});
    expect((await executeDurablePreferenceAction(actor,operation,repository,service,abort.signal)).error).toBe('forbidden');
  });
  it('forwards verified identity and the same action once, preserving the durable receipt',async()=>{
    const {repository,service,abort}=fixture();
    expect(await executeDurablePreferenceAction(actor,operation,repository,service,abort.signal)).toEqual(answer);
    expect(service.execute).toHaveBeenCalledExactlyOnceWith({actorId:actor,subjectId:actor,organizationId:'verified-org',operation,signal:abort.signal});
  });
  it('rejects foreign subjects, synthetic sources and revoked access before service calls',async()=>{
    const {repository,service,abort}=fixture();
    expect((await executeDurablePreferenceAction(actor,{...operation,clientId:id},repository,service,abort.signal)).error).toBe('forbidden');
    repository.dataSource='synthetic';
    expect((await executeDurablePreferenceAction(actor,operation,repository,service,abort.signal)).error).toBe('uncertain');
    repository.dataSource='authorized_records';repository.authorize=vi.fn().mockRejectedValue(new Error('forbidden'));
    expect((await executeDurablePreferenceAction(actor,{...operation,operation:'receipt',proposalId:undefined,hash:undefined,resourceVersion:undefined},repository,service,abort.signal)).ok).toBe(false);
    expect((await executeDurablePreferenceAction(actor,{version:operation.version,operation:'receipt',conversationId:id,turnId:id,actionId:id},repository,service,abort.signal)).error).toBe('forbidden');
    expect(service.execute).not.toHaveBeenCalled();
  });
  it('distinguishes cancellation before dispatch from an unknown commit after dispatch without retry',async()=>{
    const first=fixture();first.abort.abort();
    expect((await executeDurablePreferenceAction(actor,operation,first.repository,first.service,first.abort.signal)).error).toBe('cancelled');
    expect(first.service.execute).not.toHaveBeenCalled();
    const second=fixture();second.service.execute.mockImplementation(async()=>{second.abort.abort();return answer;});
    expect((await executeDurablePreferenceAction(actor,operation,second.repository,second.service,second.abort.signal)).error).toBe('uncertain');
    expect(second.service.execute).toHaveBeenCalledTimes(1);
  });
  it.each([{...answer,storage:'isolated_ephemeral'},{...answer,receipt:{...receipt,actionId:actor}},{...answer,receipt:{...receipt,proposalId:actor}},{...answer,receipt:{...receipt,resourceVersion:null}}])('does not relabel an unbound or invalid result as committed',async response=>{
    const {repository,service,abort}=fixture(vi.fn().mockResolvedValue(response));
    expect((await executeDurablePreferenceAction(actor,operation,repository,service,abort.signal)).error).toBe('uncertain');
  });
  it('returns uncertain on a thrown service error without exposing details or repeating the call',async()=>{
    const {repository,service,abort}=fixture(vi.fn().mockRejectedValue(new Error('private database detail')));
    const result=await executeDurablePreferenceAction(actor,operation,repository,service,abort.signal);
    expect(result.error).toBe('uncertain');expect(JSON.stringify(result)).not.toContain('private');expect(service.execute).toHaveBeenCalledTimes(1);
  });
});

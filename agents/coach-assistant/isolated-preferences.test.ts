import { describe, expect, it } from 'vitest';
import { createIsolatedPreferenceService } from './isolated-preferences';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';

const actor='a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const id='aac3a82e-898c-4907-b9b9-75133bb6d27f';
const base={version:'coach-assistant.v2',conversationId:id,turnId:id};
function fixture(now?:()=>Date) {
  const service=createIsolatedPreferenceService([{actorId:actor,subjectId:actor,organizationId:'fixture-org',preferences:defaultWorkoutPreferences}],now);
  const version=service.read(actor,actor)!.version;
  const proposal=service.execute(actor,{...base,operation:'propose',action:'preference.update',resourceVersion:version,after:{durationMinutes:45}}).proposal!;
  const apply={...base,operation:'apply',proposalId:proposal.id,hash:proposal.hash,actionId:id,resourceVersion:version};
  return {service,proposal,apply};
}
describe('isolated preference transactions',()=>{
  it('does not change preferences on proposal, applies once and queries its real fixture receipt',()=>{
    const {service,apply}=fixture();
    expect(service.read(actor,actor)?.preferences.durationMinutes).toBe(30);
    const first=service.execute(actor,apply);
    expect(first.storage).toBe('isolated_ephemeral');
    expect(first.receipt?.status).toBe('applied');
    expect(service.read(actor,actor)?.preferences.durationMinutes).toBe(45);
    expect(service.execute(actor,apply).receipt).toEqual(first.receipt);
    expect(service.execute(actor,{...base,operation:'receipt',actionId:id}).receipt).toEqual(first.receipt);
  });
  it('rejects stale proposals, changed idempotency payloads and invalid preference values',()=>{
    const {service,apply}=fixture();
    const second=service.execute(actor,{...base,operation:'propose',action:'preference.update',resourceVersion:apply.resourceVersion,after:{durationMinutes:60}}).proposal!;
    service.execute(actor,apply);
    expect(service.execute(actor,{...apply,proposalId:second.id,hash:second.hash}).error).toBe('idempotency_conflict');
    expect(service.execute(actor,{...apply,actionId:actor,proposalId:second.id,hash:second.hash}).error).toBe('version_conflict');
    expect(service.execute(actor,{...base,operation:'propose',action:'preference.update',resourceVersion:apply.resourceVersion,after:{durationMinutes:999}}).error).toBe('invalid_input');
  });
  it('rechecks revocation and thread scope before exposing proposals or receipts',()=>{
    const {service,apply}=fixture();
    expect(service.execute(actor,{...apply,conversationId:actor}).error).toBe('not_found');
    service.execute(actor,apply);service.revoke(actor,actor);
    expect(service.execute(actor,apply).error).toBe('forbidden');
    expect(service.execute(actor,{...base,operation:'receipt',actionId:id}).error).toBe('forbidden');
  });
  it('expires unapplied proposals and returns copies that cannot mutate canonical state',()=>{
    let time=0;const {service,proposal,apply}=fixture(()=>new Date(time));
    proposal.after.durationMinutes=60;
    time=300001;
    expect(service.execute(actor,apply).error).toBe('expired');
    const copy=service.read(actor,actor)!;copy.preferences.durationMinutes=60;
    expect(service.read(actor,actor)?.preferences.durationMinutes).toBe(30);
  });
});

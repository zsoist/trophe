import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PreferenceController } from '@/components/assistant/preference-state';
import { createPreferenceStore } from '@/agents/coach-assistant/preference-store';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';

it('retains the applied profile version after cancelling a subsequent proposal',async()=>{
  const actor=randomUUID(), conversation=randomUUID();
  const store=createPreferenceStore([{actorId:actor,subjectId:actor,organizationId:'fixture-org',preferences:defaultWorkoutPreferences}],{hash:value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),id:randomUUID});
  const controller=new PreferenceController();
  const transport=async(operation:Parameters<typeof store.execute>[1])=>store.execute(actor,operation);
  const original=store.read(actor,actor)!;
  await controller.propose(conversation,original.version,45,transport);
  await controller.apply(conversation,transport);
  expect(store.read(actor,actor)?.preferences.durationMinutes).toBe(45);
  const appliedReceipt=controller.snapshot().receipt!;
  const appliedVersion=appliedReceipt.resourceVersion!;
  await controller.propose(conversation,appliedVersion,60,transport);
  controller.dismiss();
  expect(store.execute(actor,{version:'coach-assistant.v2',operation:'receipt',conversationId:conversation,turnId:randomUUID(),actionId:appliedReceipt.actionId}).receipt).toEqual(appliedReceipt);
  // ContextCards uses the separately retained confirmed state.
  const state=controller.snapshot();
  const displayedVersion=state.confirmed?.version ?? original.version;
  expect(state.confirmed).toMatchObject({durationMinutes:45,version:appliedVersion,storage:'isolated_ephemeral'});
  expect(displayedVersion).toBe(store.read(actor,actor)?.version);
  await controller.propose(conversation,displayedVersion!,60,transport);
  expect(controller.snapshot().error).toBeNull();
  expect(controller.snapshot().proposal?.before.durationMinutes).toBe(45);
  await controller.apply(conversation,transport);
  expect(store.read(actor,actor)?.preferences.durationMinutes).toBe(60);
  controller.reset();
  expect(controller.snapshot().confirmed).toBeNull();
  expect(controller.snapshot().receipt).toBeNull();
});

import { createHash } from 'node:crypto';
import { workoutPreferencesSchema } from '@/lib/workout/preferences';
import { actionOperationSchema, memoryCardSchema } from './schema';
import { createIsolatedPreferenceService } from './isolated-preferences';
import { windowFor } from './context';
import type { CoachActionResult } from './contracts';
import type { CoachRepository } from './repository';

type Binding = { scope:string; baseline:string; expires:number; service:ReturnType<typeof createIsolatedPreferenceService> };
const fail = (error:CoachActionResult['error']):CoachActionResult => ({version:'coach-assistant.v2',ok:false,storage:'isolated_ephemeral',error});
const digest = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Coordinates the existing fixture transaction service behind real route auth.
 * Profile reads use the authorized repository; writes affect only the isolated
 * copy. Receipts are process-local and lost on expiry/restart, never durable.
 */
export function createIsolatedActionsBroker(clock:()=>Date = ()=>new Date()) {
  const bindings = new Map<string,Binding>();
  return {
    async execute(actorId:string,raw:unknown,repository:CoachRepository,signal:AbortSignal):Promise<CoachActionResult> {
      const parsed=actionOperationSchema.safeParse(raw);
      if(!parsed.success)return fail('invalid_input');
      const input=parsed.data;
      const subject=input.clientId??actorId;
      // The first connected action only covers client-self preferences.
      if(subject!==actorId)return fail('forbidden');
      if(repository.dataSource!=='authorized_records')return fail('uncertain');
      try {
        signal.throwIfAborted();
        const context=await repository.authorize(actorId,subject,signal);
        signal.throwIfAborted();
        if(context.actorId!==actorId||context.subjectId!==subject)return fail('forbidden');
        const scope=JSON.stringify(context);
        const key=JSON.stringify([actorId,subject,input.conversationId]);
        const currentTime=clock();
        for(const [id,binding] of bindings)if(binding.expires<=currentTime.getTime())bindings.delete(id);
        let binding=bindings.get(key);
        if(binding&&binding.scope!==scope)return fail('forbidden');
        // A missing local receipt after restart/expiry is uncertain, not proof
        // that the previous request did not execute. The caller must not retry.
        if(!binding&&input.operation!=='propose')return fail('uncertain');
        if(binding&&input.operation==='apply') {
          const prior=binding.service.execute(actorId,{version:input.version,operation:'receipt',conversationId:input.conversationId,turnId:input.turnId,actionId:input.actionId});
          if(prior.ok)return binding.service.execute(actorId,input);
        }
        if(input.operation!=='receipt') {
          if(!repository.personalContext)return fail('uncertain');
          const data=await repository.personalContext({context,window:windowFor('today',context.timezone,currentTime),limit:1,signal});
          const fresh=await repository.authorize(actorId,subject,signal);
          signal.throwIfAborted();
          if(JSON.stringify(fresh)!==scope)return fail('forbidden');
          if(data.truncated||data.rows.length!==1||data.rows[0].userId!==subject)return fail('forbidden');
          const preferences=workoutPreferencesSchema.safeParse(data.rows[0].preferences);
          if(!preferences.success)return fail('invalid_input');
          // Re-read the map after awaits: concurrent requests share one store.
          binding=bindings.get(key);
          if(data.rows[0].memories.some(memory=>memory.userId!==subject))return fail('forbidden');
          const memories=data.rows[0].memories.slice(0,10).map(memory=>memoryCardSchema.parse({id:memory.id,text:memory.text,source:memory.source,createdAt:new Date(memory.createdAt).toISOString(),scope:memory.scope,version:memory.version,confirmation:'unconfirmed'}));
          const baseline=digest({preferences:preferences.data,memories});
          if(binding&&(binding.scope!==scope||binding.baseline!==baseline))return fail('version_conflict');
          if(!binding) {
            if(bindings.size>=64)return fail('uncertain');
            binding={scope,baseline,expires:currentTime.getTime()+1800000,service:createIsolatedPreferenceService([{actorId,subjectId:subject,organizationId:context.organizationId,preferences:preferences.data,memories}],clock)};
            bindings.set(key,binding);
          }
        }
        signal.throwIfAborted();
        return binding!.service.execute(actorId,input);
      } catch(error) {
        return fail(error instanceof Error&&['forbidden','unauthenticated'].includes(error.message)?'forbidden':'uncertain');
      }
    },
  };
}

export const isolatedActionsBroker = createIsolatedActionsBroker();

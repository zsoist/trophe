import { runConversationCandidate } from './conversation-candidate';
import { createIsolatedEngineBoundary } from './isolated-engine-boundary';
import type { RunOptions } from './index';
import type { CoachConversationRequest } from './contracts';
import type { CoachConversationResponse } from './contracts';

export interface IsolatedCoachEngineBinding {
 readonly kind:'isolated_coach_engine_binding';
 run(raw:unknown,options:RunOptions&{filterMemoryHistory?:(input:CoachConversationRequest)=>CoachConversationRequest;isolatedActionsEnabled?:boolean;workoutSetIntentsEnabled?:boolean;foodQuantityIntentsEnabled?:boolean}):Promise<CoachConversationResponse>;
}
interface VerifiedExecution {binding:IsolatedCoachEngineBinding;request:string;actorId:string}
const bindings=new WeakSet<IsolatedCoachEngineBinding>();
const executions=new WeakMap<CoachConversationResponse,VerifiedExecution>();
const stable=(value:unknown):string=>{
 if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
 if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable((value as Record<string,unknown>)[key])}`).join(',')}}`;
 return JSON.stringify(value);
};
/** AG1 route composition point; never accepts request-controlled provider/options. */
export function createIsolatedCoachEngineBinding(env:Record<string,string|undefined>):IsolatedCoachEngineBinding{
 const {boundary,provider}=createIsolatedEngineBoundary(env);
 const binding:IsolatedCoachEngineBinding=Object.freeze({kind:'isolated_coach_engine_binding',async run(raw:unknown,options:RunOptions&{filterMemoryHistory?:(input:CoachConversationRequest)=>CoachConversationRequest;isolatedActionsEnabled?:boolean;workoutSetIntentsEnabled?:boolean;foodQuantityIntentsEnabled?:boolean}){
  if(options.repository.dataSource!=='authorized_records')throw new Error('isolated_engine_requires_authorized_records');
  const response=await runConversationCandidate(raw,{...options,mode:'model',offlineConversationProvider:provider,isolatedFixtureBoundary:boundary});
  executions.set(response,{binding,request:stable(raw),actorId:options.actorId});
  return response;
 }});
 bindings.add(binding);return binding;
}

/** Process-local attestation for the exact response object returned by this
 * binding. It cannot attest copied/serialized or caller-constructed output. */
export function isIsolatedCoachEngineBinding(value:unknown):value is IsolatedCoachEngineBinding{
 return !!value&&typeof value==='object'&&bindings.has(value as IsolatedCoachEngineBinding);
}
export function verifyIsolatedCoachEngineExecution(binding:IsolatedCoachEngineBinding,input:unknown,actorId:string,response:CoachConversationResponse):boolean{
 if(!bindings.has(binding))return false;const execution=executions.get(response);
 return !!execution&&execution.binding===binding&&execution.actorId===actorId&&execution.request===stable(input);
}

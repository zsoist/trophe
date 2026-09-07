import { runConversationCandidate } from './conversation-candidate';
import { createIsolatedEngineBoundary } from './isolated-engine-boundary';
import type { RunOptions } from './index';
import type { CoachConversationRequest } from './contracts';
/** AG1 route composition point; never accepts request-controlled provider/options. */
export function createIsolatedCoachEngineBinding(env:Record<string,string|undefined>){
 const {boundary,provider}=createIsolatedEngineBoundary(env);
 return Object.freeze({async run(raw:unknown,options:RunOptions&{filterMemoryHistory?:(input:CoachConversationRequest)=>CoachConversationRequest}){
  if(options.repository.dataSource!=='authorized_records')throw new Error('isolated_engine_requires_authorized_records');
  return runConversationCandidate(raw,{...options,mode:'model',offlineConversationProvider:provider,isolatedFixtureBoundary:boundary});
 }});
}

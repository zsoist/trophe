import { runConversation } from './conversation';
import { CAPABILITY_PROMPT_VERSION } from './capability-conversation';
import { COACH_CANDIDATE_PROMPT_VERSION } from './prompt.v5';
import type { CoachCapabilityRegistry } from './capability-registry';
import type { CoachRepository } from './repository';
import type { PilotCandidate } from './pilot-runner';
export const CAPABILITY_PILOT_POLICY_VERSION='coach-capability-pilot.v1';
export const CAPABILITY_PILOT_PROMPTS=Object.freeze([CAPABILITY_PROMPT_VERSION,COACH_CANDIDATE_PROMPT_VERSION]);
/** Explicit synthetic evaluation composition; no product/HTTP selection or live data. */
export function createCapabilityPilotCandidate(fixture:{actorId:string;repository:()=>CoachRepository;registry:CoachCapabilityRegistry}):PilotCandidate{
 return {promptVersion:COACH_CANDIDATE_PROMPT_VERSION,invocationPromptVersions:CAPABILITY_PILOT_PROMPTS,async run(raw,options){
  const repository=fixture.repository();if(repository.dataSource!=='synthetic')throw new Error('budget_blocked');
  return runConversation(raw,{...options,actorId:fixture.actorId,repository,capabilityRegistry:fixture.registry,offlineCandidateEvaluation:true});
 }};
}

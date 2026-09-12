import { runConversationCandidate } from './conversation-candidate';
import { COACH_CANDIDATE_PROMPT_VERSION } from './prompt.v5';
import { COACH_CONVERSATIONAL_PROMPT_VERSION } from './prompt.v4';
import { CAPABILITY_PROMPT_VERSION } from './capability-conversation';
import { runCoachPilotEvaluation,type PilotCandidate,type PilotTransport } from './pilot-runner';
import type { PilotBudgetStore } from './pilot-budget';
/** Explicit composition of the actual guarded engine, not a replacement evaluator.
 * Budget and transport remain governed by the existing measured runner.
 */
export const coachConversationPilotCandidate:PilotCandidate={promptVersion:COACH_CANDIDATE_PROMPT_VERSION,allowedPromptVersions:[COACH_CONVERSATIONAL_PROMPT_VERSION,CAPABILITY_PROMPT_VERSION],run:runConversationCandidate};
export function runCoachConversationPilot(raw:unknown,deps:{store:PilotBudgetStore;signal:AbortSignal;transport?:PilotTransport}){
 return runCoachPilotEvaluation(raw,{...deps,candidate:coachConversationPilotCandidate});
}

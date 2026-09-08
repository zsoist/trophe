import { isIsolatedEngineBoundary, type IsolatedEngineBoundary } from './isolated-engine-boundary';
import { runConversation } from './conversation';
import type { RunOptions } from './index';
import { explicitFoodQuantityCorrectionTarget, explicitSetCorrectionTarget, type OfflineConversationProvider } from './open-conversation';

/** Explicit evaluation entrypoint, never selected by HTTP/request JSON.
 * No per-turn semantic oracle: acceptance belongs to independent release evals.
 * Non-synthetic inputs remain blocked and all results are marked unapproved.
 */
export async function runConversationCandidate(raw:unknown,options:RunOptions&{capabilityRegistry?:import('./capability-registry').CoachCapabilityRegistry;offlineConversationProvider:OfflineConversationProvider;isolatedFixtureBoundary?:IsolatedEngineBoundary;isolatedActionsEnabled?:boolean;workoutSetIntentsEnabled?:boolean;foodQuantityIntentsEnabled?:boolean;pilotEvaluation?:boolean;providerEvidence?:'injected_fixture'|'provider_real'}) {
  const request=raw&&typeof raw==='object'?raw as Record<string,unknown>:null;
  const context=request?.context&&typeof request.context==='object'?request.context as Record<string,unknown>:null;
  const workspace=context?.workspace&&typeof context.workspace==='object'?context.workspace as Record<string,unknown>:null;
  const boundDraftRequest=context?.includeScreen===true&&(context.surface==='plan'||context.surface==='workout')
    && workspace?.kind==='draft'&&typeof workspace.version==='string'&&/^[a-f0-9]{64}$/.test(workspace.version);
  const boundSetRequest=options.workoutSetIntentsEnabled===true
    && typeof request?.message==='string'&&explicitSetCorrectionTarget(request.message)!==null
    && typeof context?.surface==='string';
  const boundFoodRequest=options.foodQuantityIntentsEnabled===true
    && typeof request?.message==='string'&&explicitFoodQuantityCorrectionTarget(request.message)!==null
    && typeof context?.surface==='string';
  const fixtureAction=(options.isolatedActionsEnabled===true&&boundDraftRequest||boundSetRequest||boundFoodRequest)
    && isIsolatedEngineBoundary(options.isolatedFixtureBoundary,options.offlineConversationProvider);
  const measuredPilot=options.pilotEvaluation===true;
  const result=await runConversation(raw,{...options,mode:'model',offlineCandidateEvaluation:measuredPilot?false:!fixtureAction,
    workoutSetIntentsEnabled:measuredPilot||options.workoutSetIntentsEnabled,foodQuantityIntentsEnabled:measuredPilot||options.foodQuantityIntentsEnabled,
    ...(fixtureAction||measuredPilot?{offlineInterpretationReview:async()=>({approved:true})}:{}),
  });
  return {...result,evaluation:{transport:options.providerEvidence??'injected_fixture',records:result.dataSource,release:'unapproved_candidate' as const,semanticQualityVerified:false as const}};
}

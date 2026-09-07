import type { IsolatedEngineBoundary } from './isolated-engine-boundary';
import { runConversation } from './conversation';
import type { RunOptions } from './index';
import type { OfflineConversationProvider } from './open-conversation';

/** Explicit evaluation entrypoint, never selected by HTTP/request JSON.
 * No per-turn semantic oracle: acceptance belongs to independent release evals.
 * Non-synthetic inputs remain blocked and all results are marked unapproved.
 */
export async function runConversationCandidate(raw:unknown,options:RunOptions&{offlineConversationProvider:OfflineConversationProvider;isolatedFixtureBoundary?:IsolatedEngineBoundary}) {
  const result=await runConversation(raw,{...options,mode:'model',offlineCandidateEvaluation:true});
  return {...result,evaluation:{transport:'injected_fixture' as const,records:result.dataSource,release:'unapproved_candidate' as const,semanticQualityVerified:false as const}};
}

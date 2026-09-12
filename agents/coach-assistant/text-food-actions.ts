import type { CoachRepository } from './repository';
import { textFoodOperationSchema, textFoodResultSchema, type TextFoodScope, type TextFoodOperation, type TextFoodResult } from './text-food-contract';
export interface TextFoodService { execute(scope: TextFoodScope & { operation: TextFoodOperation }): Promise<TextFoodResult> }
export async function executeTextFoodAction(actorId: string, raw: unknown, repository: CoachRepository, service: TextFoodService, signal: AbortSignal): Promise<TextFoodResult> {
  const parsed = textFoodOperationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  if (repository.dataSource !== 'authorized_records') return { ok: false, error: 'not_connected' };
  const operation = parsed.data;
  try {
    signal.throwIfAborted();
    const context = await repository.authorize(actorId, actorId, signal);
    if (context.actorId !== actorId || context.subjectId !== actorId || !context.organizationId) return { ok: false, error: 'forbidden' };
    const output = await service.execute({ actorId, subjectId: actorId, organizationId: context.organizationId, operation, signal });
    signal.throwIfAborted();
    const fresh = await repository.authorize(actorId, actorId, signal);
    if (JSON.stringify(fresh) !== JSON.stringify(context)) return { ok: false, error: 'forbidden' };
    const result = textFoodResultSchema.parse(output);
    if (!result.ok) return result;
    if (operation.operation === 'text.food.parse' && 'draft' in result && result.draft.id === operation.requestId && result.draft.rawText === operation.text) return result;
    if (operation.operation === 'text.food.read' && ('draft' in result ? result.draft.id === operation.proposalId : 'proposal' in result && result.proposal.id === operation.proposalId)) return result;
    if (operation.operation === 'text.food.propose' && 'proposal' in result && result.proposal.draftId === operation.draftId && result.proposal.draftHash === operation.hash && JSON.stringify(result.proposal.after) === JSON.stringify(operation.after)) return result;
    if ('actionId' in operation && 'receipt' in result && result.receipt.actionId === operation.actionId && (operation.operation === 'text.food.receipt' || result.receipt.proposalId === operation.proposalId && result.receipt.hash === operation.hash)) return result;
    return { ok: false, error: 'uncertain' };
  } catch { return { ok: false, error: 'uncertain' }; }
}

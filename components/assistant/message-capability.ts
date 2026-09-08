import type { CoachMessageProposal } from '@/agents/coach-assistant/message-actions';
import { readCoachMessageResult } from '@/agents/coach-assistant/message-result-reader';

const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

/** Extracts only a current, self-scoped, review-only human-message proposal. */
export function acceptedMessageProposal(
  value: unknown,
  identity: string,
  conversationId: string,
  turnId: string,
): CoachMessageProposal | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as Record<string, unknown>;
  const snapshot = response.snapshot as Record<string, unknown> | undefined;
  const capability = response.capabilityResult as Record<string, unknown> | undefined;
  if (response.version !== 'coach-assistant.v2' || response.ok !== true
    || response.conversationId !== conversationId || response.turnId !== turnId
    || !snapshot || snapshot.access !== 'self' || snapshot.subjectId !== identity
    || !capability || !exactKeys(capability, ['tool', 'status', 'result', 'applied'])
    || capability.tool !== 'coach.message.propose' || capability.status !== 'review_required' || capability.applied !== false) return null;
  const result = readCoachMessageResult(capability.result);
  return result?.ok && 'proposal' in result ? result.proposal : null;
}

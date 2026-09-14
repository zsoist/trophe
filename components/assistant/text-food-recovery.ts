import { z } from 'zod';
import { textFoodOperationSchema } from '@/agents/coach-assistant/text-food-contract';
const schema = z.object({ operation: textFoodOperationSchema, draftId: z.string().uuid(), draftHash: z.string().regex(/^[a-f0-9]{64}$/), entryIds: z.array(z.string().uuid()).min(1).max(12) }).strict().refine(value => value.operation.operation === 'text.food.apply');
export type TextFoodRecovery = z.infer<typeof schema>;
const key = (conversationId: string) => `trophe:text-food:pending:${conversationId}`;
/** Only request identifiers, never credentials, food text or nutrition. Stored
 * before dispatch so a reload can check the canonical receipt without reapply. */
export function saveTextFoodRecovery(value: TextFoodRecovery) {
  const checked = schema.parse(value);
  window.sessionStorage.setItem(key(checked.operation.conversationId), JSON.stringify(checked));
}
export function readTextFoodRecovery(conversationId: string): TextFoodRecovery | null {
  try { const raw = window.sessionStorage.getItem(key(conversationId)); if (!raw || raw.length > 4096) return null; const parsed = schema.safeParse(JSON.parse(raw)); return parsed.success && parsed.data.operation.conversationId === conversationId ? parsed.data : null; } catch { return null; }
}
export function clearTextFoodRecovery(conversationId: string) { try { window.sessionStorage.removeItem(key(conversationId)); } catch { /* A stale recovery can only re-read its receipt. */ } }

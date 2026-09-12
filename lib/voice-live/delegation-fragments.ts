/**
 * Turns a batch of unseen raw user fragments into the exact text one delegation should
 * carry. Kept deliberately tiny and pure so the client wiring and its regression share a
 * single definition.
 *
 * A delegation consumes RAW fragments by monotonic sequence, never display caption rows:
 * a later fragment can merge into a caption row an earlier delegation already read (same
 * speaker, close timestamps), and a row-based cursor would then strand that new fragment
 * forever. Fragments are provider deltas of a continuous utterance, so they are joined
 * verbatim (with no invented separator) and only the existing trailing length bound applies.
 */
import type { LiveTranscriptCursor, LiveUserFragmentBatch } from './client-types';

/** Existing bound on delegated text forwarded to the backend. */
export const MAX_DELEGATED_TEXT = 2_000;

export interface DelegationReservation {
  /** Exact text for the unseen fragments, or empty when there are none. */
  text: string;
  /** Cursor to record once this delegation is actually dispatched. */
  cursor: LiveTranscriptCursor;
  /** True when capacity evicted unconsumed fragments before this batch. */
  truncated: boolean;
}

/**
 * Build the delegation reservation from a fragment batch, or `null` when there is no unseen
 * user speech. Returning `null` (instead of dispatching empty text) is what prevents a
 * repeated delegation id or a redelivered event_id from re-sending an old utterance.
 */
export function reservationFor(batch: LiveUserFragmentBatch): DelegationReservation | null {
  const text = batch.fragments.map(fragment => fragment.text).join('');
  if (!text.trim()) return null;
  return { text: text.slice(-MAX_DELEGATED_TEXT), cursor: batch.cursor, truncated: batch.truncated || text.length > MAX_DELEGATED_TEXT };
}

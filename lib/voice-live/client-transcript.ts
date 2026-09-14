/**
 * Revisable client-side caption model for live transcript deltas plus the explicit
 * dictation draft.
 *
 * The provider sends ONLY deltas (`event_id`/`delta`/`start_ms`/`end_ms`): there is no
 * item id, no utterance id and no authoritative turn-completed/final event. Grouping here
 * is therefore LOCAL and display-only: rows group by speaker + timestamp proximity, are
 * deduped by provider `event_id`, and may be revised by late/out-of-order fragments. A row
 * is never a complete semantic turn and must never trigger tool execution or cancel
 * backend work.
 */
import type { LiveTranscriptCursor, LiveTranscriptRow, LiveUserFragment, LiveUserFragmentBatch } from './client-types';

/** A new group starts when deltas of one speaker are separated by more than this gap. */
const GROUP_GAP_MS = 2_000;

/**
 * Finite capacity of the raw user fragment queue. Display rows may merge arbitrary numbers
 * of fragments, so the fragment queue is capped independently to keep memory bounded. When
 * it overflows the OLDEST fragments are evicted and the loss is reported via `truncated`
 * (never silently replayed or swallowed).
 */
const MAX_USER_FRAGMENTS = 256;

export class LiveTranscript {
  private rows: LiveTranscriptRow[] = [];
  private sequence = 0;
  private readonly seenEventIds = new Set<string>();
  /** Raw user fragments, in arrival order. Consumption is by monotonic `seq`, not by row. */
  private userFragments: LiveUserFragment[] = [];
  private userSequence = 0;
  /** Highest evicted fragment `seq`; a cursor at or below this lost unconsumed fragments. */
  private userDroppedThroughSeq = 0;

  /**
   * Append one delta fragment. Returns the current display rows.
   *
   * - A repeated provider `event_id` is ignored (dedup — never double-counted).
   * - Same speaker within `GROUP_GAP_MS` extends the open group.
   * - An unseen fragment that starts before the open group's end is a late/out-of-order
   *   revision: it merges into that group and flags `revision: true` instead of opening a
   *   second row.
   * - Otherwise a fresh group opens and any prior open group for that speaker is settled.
   */
  append(
    speaker: LiveTranscriptRow['speaker'],
    delta: string,
    startMs: number,
    endMs: number,
    options: { newRow?: boolean; eventId?: string | null } = {},
  ): LiveTranscriptRow[] {
    const eventId = options.eventId ?? null;
    if (eventId) {
      if (this.seenEventIds.has(eventId)) return this.rows;
      this.seenEventIds.add(eventId);
    }
    if (!delta) return this.rows;

    // Raw fragment bookkeeping is independent of display grouping: an unseen overlapping
    // fragment still gets its own sequence even when it merges into the open caption row.
    if (speaker === 'user') this.recordUserFragment(delta, startMs, endMs, eventId);

    const last = this.rows[this.rows.length - 1];
    const open = !options.newRow && last && last.speaker === speaker && last.status === 'open' ? last : null;
    const groups = open !== null && startMs <= (open?.endMs ?? 0) + GROUP_GAP_MS;

    if (open && groups) {
      // A fragment whose interval precedes the group's end is a late revision, not a new
      // utterance. Merge it without duplicating identical text growth.
      const late = startMs < open.endMs;
      const text = late && open.text.endsWith(delta) ? open.text : open.text + delta;
      const updated: LiveTranscriptRow = {
        ...open,
        text,
        startMs: Math.min(open.startMs, startMs),
        endMs: Math.max(open.endMs, endMs),
        eventId: eventId ?? open.eventId,
        revision: open.revision === true || late,
      };
      this.rows = [...this.rows.slice(0, -1), updated];
      return this.rows;
    }

    // New group: settle any still-open group for this speaker first.
    const settled = this.rows.map(row =>
      row.speaker === speaker && row.status === 'open' ? { ...row, status: 'settled' as const } : row);
    this.rows = [...settled, {
      speaker,
      text: delta,
      startMs,
      endMs,
      id: `row-${++this.sequence}`,
      eventId: eventId ?? undefined,
      status: 'open',
    }];
    return this.rows;
  }

  private recordUserFragment(text: string, startMs: number, endMs: number, eventId: string | null): void {
    this.userSequence += 1;
    this.userFragments.push({ seq: this.userSequence, eventId, text, startMs, endMs });
    while (this.userFragments.length > MAX_USER_FRAGMENTS) {
      const dropped = this.userFragments.shift();
      if (dropped) this.userDroppedThroughSeq = dropped.seq;
    }
  }

  /** Explicitly settle the open group(s) for a speaker (or all speakers) without adding text. */
  settle(speaker: LiveTranscriptRow['speaker'] | null = null): LiveTranscriptRow[] {
    this.rows = this.rows.map(row =>
      row.status === 'open' && (speaker === null || row.speaker === speaker) ? { ...row, status: 'settled' as const } : row);
    return this.rows;
  }

  /** Caption groups for one speaker (or all), in arrival order. Display-only. */
  captions(speaker: LiveTranscriptRow['speaker'] | null = null): LiveTranscriptRow[] {
    return this.rows.filter(row => speaker === null || row.speaker === speaker);
  }

  /**
   * Unconsumed RAW user fragments after `cursor`, in arrival order, plus the cursor to
   * record once they are dispatched. This is the only supported way to decide what a
   * delegation has not yet seen: display caption rows merge fragments, so a row-based
   * cursor would strand any fragment that arrived after a row was already consumed.
   *
   * `truncated` is true when the cursor is older than the retained window, i.e. capacity
   * evicted fragments the caller never consumed. Callers must surface that explicitly.
   */
  pendingUserFragments(cursor: LiveTranscriptCursor | null): LiveUserFragmentBatch {
    const fromSeq = cursor && Number.isFinite(cursor.sequence) && cursor.sequence > 0 ? Math.floor(cursor.sequence) : 0;
    const fragments = this.userFragments.filter(fragment => fragment.seq > fromSeq);
    const last = fragments[fragments.length - 1];
    return {
      fragments,
      cursor: {
        sequence: last ? last.seq : fromSeq,
        lastEventId: last ? last.eventId : cursor?.lastEventId ?? null,
      },
      truncated: fromSeq < this.userDroppedThroughSeq,
    };
  }

  snapshot(): LiveTranscriptRow[] {
    return this.rows.map(row => ({ ...row }));
  }

  clear(): void {
    this.rows = [];
    this.seenEventIds.clear();
    this.userFragments = [];
    this.userSequence = 0;
    this.userDroppedThroughSeq = 0;
  }
}

export type DictationDraftResult = { ok: true; text: string } | { ok: false; error: 'empty' };

/**
 * Explicit dictation submit. Returns the exact edited text (never the raw transcript),
 * or an `empty` error when there is nothing to send. The caller decides when to call it.
 */
export function commitDictation(edited: string): DictationDraftResult {
  const text = edited.trim();
  return text.length > 0 ? { ok: true, text } : { ok: false, error: 'empty' };
}

/** Dictation is editable from the moment the first fragment lands. */
export function dictationDraft(transcript: LiveTranscriptRow[], previousEdited: string): string {
  const dictated = transcript.filter(row => row.speaker === 'user').map(row => row.text).join(' ');
  return previousEdited.length > 0 ? previousEdited : dictated;
}

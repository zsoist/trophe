/**
 * Revisable transcript model for live deltas plus the explicit dictation draft.
 *
 * Grouping here is display-only: it must never trigger tool execution or cancel
 * backend work. User and assistant fragments keep their own intervals and may overlap.
 */
import type { LiveTranscriptRow } from './client-types';

export class LiveTranscript {
  private rows: LiveTranscriptRow[] = [];

  /** Append a fragment. `newRow` begins a fresh row (e.g. assistant resumes after barge-in). */
  append(
    speaker: LiveTranscriptRow['speaker'],
    delta: string,
    startMs: number,
    endMs: number,
    options: { newRow?: boolean } = {},
  ): LiveTranscriptRow[] {
    if (!delta) return this.rows;
    const last = this.rows[this.rows.length - 1];
    if (!options.newRow && last && last.speaker === speaker) {
      this.rows = [
        ...this.rows.slice(0, -1),
        { speaker, text: last.text + delta, startMs: last.startMs, endMs: Math.max(last.endMs, endMs) },
      ];
    } else {
      this.rows = [...this.rows, { speaker, text: delta, startMs, endMs }];
    }
    return this.rows;
  }

  snapshot(): LiveTranscriptRow[] {
    return this.rows.map(row => ({ ...row }));
  }

  clear(): void {
    this.rows = [];
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

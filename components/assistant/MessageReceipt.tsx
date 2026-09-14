'use client';
import styles from './GlobalCoach.module.css';

/**
 * Per-message persistence receipt for Ask Trophē.
 *
 * `confirmed` means the *message itself* was acknowledged by an authoritative canonical
 * read/readback. It is intentionally NOT derived from a successful response, a completed stream,
 * an HTTP 200, or a locally cached history snapshot. Callers must only pass `confirmed` when the
 * server path proved the message is a persisted canonical row. Unknown/no proof renders nothing.
 *
 * `pending`/`failed` are reserved for a future message-level acknowledgment contract; no current
 * server path exposes them, so production callers never emit them yet.
 */
export type MessagePersistence = 'unknown' | 'pending' | 'confirmed' | 'failed';

function PersistedGlyph() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.5 9 3.6 3.6L14 4.8" />
      <path d="m10.6 10.3 2.3 2.3L21 4.8" />
    </g>
  </svg>;
}
function PendingGlyph() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" fill="none" aria-hidden="true" focusable="false">
    <circle cx="12" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M12 5.5V9l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>;
}
function FailedGlyph() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" fill="none" aria-hidden="true" focusable="false">
    <circle cx="12" cy="9" r="6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M12 5.8v3.5m0 2.6v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>;
}

/**
 * Compact 22×17 double-check inside a 24×20 static inline box. Shape and accessible label carry
 * the meaning; colour (mint/deep green when confirmed) is never the only signal. Rendered as a
 * static indicator, not a button, so no 44px blank target is required.
 */
export function MessageReceipt({ persistence, label }: { persistence: MessagePersistence; label: string }) {
  if (persistence === 'unknown') return null;
  return <span
    className={styles.messageReceipt}
    data-persistence={persistence}
    role="img"
    aria-label={label}
    title={label}
  >
    {persistence === 'confirmed' ? <PersistedGlyph /> : persistence === 'pending' ? <PendingGlyph /> : <FailedGlyph />}
  </span>;
}

/**
 * Pixel V03 derivative waiting mark: a 16×16 crisp-edge pixel glyph rendered at 32px, inspired by
 * the dumbbell crossbar, fluted column and plinth of the Ask Trophē mark. It does not replace the
 * saved emblem bytes. Waiting only indicates that an answer is in flight; it never claims a
 * websearch, tool use, or progress percentage.
 */
export function AskWaitMark({ paused = false }: { paused?: boolean }) {
  return <span className={styles.waitMark} data-paused={paused ? 'true' : undefined} aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="2" y="1" width="1" height="1" /><rect x="3" y="1" width="1" height="1" /><rect x="12" y="1" width="1" height="1" /><rect x="13" y="1" width="1" height="1" />
      <rect x="1" y="2" width="1" height="1" /><rect x="2" y="2" width="1" height="1" /><rect x="3" y="2" width="1" height="1" /><rect x="12" y="2" width="1" height="1" /><rect x="13" y="2" width="1" height="1" /><rect x="14" y="2" width="1" height="1" />
      <rect x="1" y="3" width="1" height="1" /><rect x="2" y="3" width="1" height="1" /><rect x="3" y="3" width="1" height="1" /><rect x="4" y="3" width="1" height="1" /><rect x="5" y="3" width="1" height="1" /><rect x="6" y="3" width="1" height="1" /><rect x="7" y="3" width="1" height="1" /><rect x="8" y="3" width="1" height="1" /><rect x="9" y="3" width="1" height="1" /><rect x="10" y="3" width="1" height="1" /><rect x="11" y="3" width="1" height="1" /><rect x="12" y="3" width="1" height="1" /><rect x="13" y="3" width="1" height="1" /><rect x="14" y="3" width="1" height="1" />
      <rect x="1" y="4" width="1" height="1" /><rect x="2" y="4" width="1" height="1" /><rect x="3" y="4" width="1" height="1" /><rect x="12" y="4" width="1" height="1" /><rect x="13" y="4" width="1" height="1" /><rect x="14" y="4" width="1" height="1" />
      <rect x="2" y="5" width="1" height="1" /><rect x="3" y="5" width="1" height="1" /><rect x="12" y="5" width="1" height="1" /><rect x="13" y="5" width="1" height="1" />
      <rect x="5" y="6" width="1" height="1" /><rect x="6" y="6" width="1" height="1" /><rect x="7" y="6" width="1" height="1" /><rect x="8" y="6" width="1" height="1" /><rect x="9" y="6" width="1" height="1" /><rect x="10" y="6" width="1" height="1" />
      <rect x="6" y="7" width="1" height="1" /><rect x="7" y="7" width="1" height="1" /><rect x="8" y="7" width="1" height="1" /><rect x="9" y="7" width="1" height="1" />
      <rect x="6" y="8" width="1" height="1" /><rect x="9" y="8" width="1" height="1" />
      <rect x="6" y="9" width="1" height="1" /><rect x="9" y="9" width="1" height="1" />
      <rect x="6" y="10" width="1" height="1" /><rect x="9" y="10" width="1" height="1" />
      <rect x="6" y="11" width="1" height="1" /><rect x="9" y="11" width="1" height="1" />
      <rect x="6" y="12" width="1" height="1" /><rect x="7" y="12" width="1" height="1" /><rect x="8" y="12" width="1" height="1" /><rect x="9" y="12" width="1" height="1" />
      <rect x="5" y="13" width="1" height="1" /><rect x="6" y="13" width="1" height="1" /><rect x="7" y="13" width="1" height="1" /><rect x="8" y="13" width="1" height="1" /><rect x="9" y="13" width="1" height="1" /><rect x="10" y="13" width="1" height="1" />
      <rect x="4" y="14" width="1" height="1" /><rect x="5" y="14" width="1" height="1" /><rect x="6" y="14" width="1" height="1" /><rect x="7" y="14" width="1" height="1" /><rect x="8" y="14" width="1" height="1" /><rect x="9" y="14" width="1" height="1" /><rect x="10" y="14" width="1" height="1" /><rect x="11" y="14" width="1" height="1" />
    </svg>
  </span>;
}

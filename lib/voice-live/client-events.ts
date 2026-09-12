/**
 * Parsing/validation for GPT-Live session events received over the WebRTC data channel.
 *
 * Only events documented in the official live-events guide are recognised. Unknown
 * shapes parse to `null` and are ignored rather than guessed at. This module has no
 * DOM, network or React dependency.
 */
import type { LiveCloseReason } from './client-types';

export type LiveEvent =
  | { type: 'session.started'; sessionId: string }
  | { type: 'session.input_transcript.delta'; delta: string; startMs: number; endMs: number }
  | { type: 'session.output_transcript.delta'; delta: string; startMs: number; endMs: number }
  | { type: 'session.usage.updated'; seconds: number }
  | { type: 'session.closed'; reason: LiveCloseReason; seconds: number | null }
  | { type: 'error'; code: string | null; message: string; clientEventId: string | null };

const CLOSE_REASONS: LiveCloseReason[] = ['close_requested', 'expired', 'content', 'remote_hangup', 'connection_lost'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isInterval = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const optionalString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Parse a raw channel payload. Returns `null` for malformed or unrecognised events. */
export function parseLiveEvent(raw: unknown): LiveEvent | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'session.started': {
      const session = isRecord(value.session) ? value.session : null;
      const sessionId = optionalString(session?.id) ?? optionalString(value.session_id);
      return sessionId ? { type: 'session.started', sessionId } : null;
    }
    case 'session.input_transcript.delta':
    case 'session.output_transcript.delta': {
      const delta = optionalString(value.delta);
      const startMs = value.start_ms;
      const endMs = value.end_ms;
      if (!delta || delta.length === 0 || !isInterval(startMs) || !isInterval(endMs) || endMs < startMs) return null;
      return { type: value.type, delta, startMs, endMs };
    }
    case 'session.usage.updated': {
      const usage = isRecord(value.usage) ? value.usage : null;
      const seconds = usage?.seconds;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
      return { type: 'session.usage.updated', seconds };
    }
    case 'session.closed': {
      if (!CLOSE_REASONS.includes(value.reason as LiveCloseReason)) return null;
      const usage = isRecord(value.usage) ? value.usage : null;
      const seconds = usage?.seconds;
      const finalSeconds = typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
      return { type: 'session.closed', reason: value.reason as LiveCloseReason, seconds: finalSeconds };
    }
    case 'error': {
      const error = isRecord(value.error) ? value.error : null;
      if (!error || typeof error.message !== 'string') return null;
      return {
        type: 'error',
        code: optionalString(error.code),
        message: error.message,
        clientEventId: optionalString(error.client_event_id),
      };
    }
    default:
      return null;
  }
}

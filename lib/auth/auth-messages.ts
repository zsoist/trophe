/**
 * Centralized, testable copy for the signup / activation auth surface (WP1 + P1 polish).
 *
 * Pure functions, no I/O — the message logic is unit-tested without a route/DOM harness
 * (the project tests auth logic in node-env vitest, not via RTL/jsdom).
 */

const SIGNUP_MESSAGES: Record<string, string> = {
  invalid: 'Invalid or expired invite code',
  exhausted: 'This invite code has no remaining uses',
  conflict: 'A signup with these details is already in progress',
  email_exists: 'Email already registered. Try logging in.',
  retry: 'Signup is briefly busy — please try again',
  delivery_failed: 'We could not send your confirmation email — please try again in a moment.',
  error: 'Signup failed',
};

/**
 * User-facing error copy for a failed signup.
 *
 * `conflict` is intentionally kept GENERIC. `claim_ordinary_signup` returns it not only when the
 * email is already registered, but also for a concurrent/different-key in-progress request or a
 * recovering reservation — so "already registered" would be false in those cases. (The genuine
 * already-confirmed replay follows `replayed_completed` → 202, never `conflict`.) A truthful
 * "already registered" message would require the DB/route to return a distinct, proven
 * `already_registered` outcome; until then, do not assert it.
 */
export function signupErrorMessage(reason: string): string {
  return SIGNUP_MESSAGES[reason] ?? 'Signup failed';
}

/** Login-page success notice when arriving from a confirmation link (`/login?confirmed=1`). */
export function confirmedLoginNotice(confirmedParam: string | null): string | null {
  return confirmedParam === '1' ? 'Account confirmed — sign in to continue.' : null;
}

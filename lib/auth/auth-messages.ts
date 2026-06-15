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
 * For an ORDINARY signup (no invite code) a `conflict` means the email's one-live-claim is
 * already taken — overwhelmingly because that email is already registered (a completed
 * reservation blocks a fresh claim) — so we tell the user to log in. Invite-path (beta/client)
 * conflicts KEEP the generic "in progress" copy: there a conflict is a transient
 * concurrent-request race, not an existing account, so "already registered" would mislead.
 */
export function signupErrorMessage(reason: string, isOrdinary: boolean): string {
  if (reason === 'conflict' && isOrdinary) return 'This email is already registered — please log in.';
  return SIGNUP_MESSAGES[reason] ?? 'Signup failed';
}

/** Login-page success notice when arriving from a confirmation link (`/login?confirmed=1`). */
export function confirmedLoginNotice(confirmedParam: string | null): string | null {
  return confirmedParam === '1' ? 'Account confirmed — sign in to continue.' : null;
}

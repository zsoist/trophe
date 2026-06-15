/**
 * WP1 part 2 — client-side submit logic for signup / client-activation, pure + DI.
 *
 * Extracted from the pages so the browser CONTRACT is structurally enforced and unit-
 * testable without a DOM: these functions have NO access to a session/sign-in primitive,
 * so a successful (202) signup CANNOT auto-login — it can only return `pending`
 * ("check your email"). The page maps the result to UI state. (Password LOGIN is a
 * separate path the page owns directly; it is intentionally not modelled here.)
 */

export interface HttpResult { status: number; ok: boolean; body: { error?: string; verification_required?: boolean; [k: string]: unknown } }
export interface SubmitDeps { postJson(url: string, body: unknown): Promise<HttpResult> }

export type SubmitResult =
  | { kind: 'pending'; email: string }   // 202 verification_required — show "check your email", do NOT log in
  | { kind: 'error'; message: string };  // 4xx/5xx (incl. 503 delivery_failed) — stay on the form

export interface SignupInput { email: string; password: string; fullName: string; inviteCode?: string; consent: boolean }
export interface ActivationInput { token: string; email: string; password: string; fullName: string; consent: boolean }

const CONSENT_REQUIRED = 'Please consent to data processing to continue.';
const NETWORK_ERR = 'Network error — please check your connection and try again.';
const UNEXPECTED = 'Unexpected server response — please try again.';

/** The success contract is STRICTLY HTTP 202 + verification_required:true. Any other 2xx
 *  shape (200/201/204, or 202 without the flag) is treated as an error — fail closed. */
function pendingOrError(res: HttpResult, email: string, failMsg: string): SubmitResult {
  if (!res.ok) return { kind: 'error', message: res.body?.error || failMsg };
  if (res.status === 202 && res.body?.verification_required === true) return { kind: 'pending', email };
  return { kind: 'error', message: UNEXPECTED };
}

/** Wrap postJson so a transport REJECTION becomes a result (never an unhandled rejection
 *  that leaves the page's loading state stuck). */
async function safePost(deps: SubmitDeps, url: string, body: unknown): Promise<HttpResult | null> {
  try { return await deps.postJson(url, body); } catch { return null; }
}

export async function submitSignup(deps: SubmitDeps, input: SignupInput): Promise<SubmitResult> {
  if (!input.consent) return { kind: 'error', message: CONSENT_REQUIRED }; // fail closed before any request
  const res = await safePost(deps, '/api/auth/signup', {
    email: input.email, password: input.password, full_name: input.fullName,
    inviteCode: input.inviteCode, consent: true,
  });
  if (!res) return { kind: 'error', message: NETWORK_ERR };
  return pendingOrError(res, input.email, 'Signup failed');
}

export async function submitActivation(deps: SubmitDeps, input: ActivationInput): Promise<SubmitResult> {
  if (!input.consent) return { kind: 'error', message: CONSENT_REQUIRED };
  const res = await safePost(deps, '/api/auth/activate-client', {
    token: input.token, email: input.email, password: input.password, full_name: input.fullName, consent: true,
  });
  if (!res) return { kind: 'error', message: NETWORK_ERR };
  return pendingOrError(res, input.email, 'Activation failed');
}

/** Re-trigger the same POST to resend the confirmation (the route replays idempotently). */
export async function resendConfirmation(deps: SubmitDeps, url: '/api/auth/signup' | '/api/auth/activate-client', body: unknown): Promise<SubmitResult> {
  const res = await safePost(deps, url, body);
  if (!res) return { kind: 'error', message: NETWORK_ERR };
  return pendingOrError(res, '', 'Could not resend');
}

/** Browser helper: wrap fetch into the SubmitDeps shape. */
export function fetchDeps(): SubmitDeps {
  return {
    async postJson(url, body) {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const parsed = await r.json().catch(() => ({}));
      return { status: r.status, ok: r.ok, body: parsed };
    },
  };
}

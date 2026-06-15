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

export async function submitSignup(deps: SubmitDeps, input: SignupInput): Promise<SubmitResult> {
  if (!input.consent) return { kind: 'error', message: CONSENT_REQUIRED }; // fail closed before any request
  const res = await deps.postJson('/api/auth/signup', {
    email: input.email, password: input.password, full_name: input.fullName,
    inviteCode: input.inviteCode, consent: true,
  });
  if (!res.ok) return { kind: 'error', message: res.body?.error || 'Signup failed' };
  return { kind: 'pending', email: input.email }; // 202 — never auto-login
}

export async function submitActivation(deps: SubmitDeps, input: ActivationInput): Promise<SubmitResult> {
  if (!input.consent) return { kind: 'error', message: CONSENT_REQUIRED };
  const res = await deps.postJson('/api/auth/activate-client', {
    token: input.token, email: input.email, password: input.password, full_name: input.fullName, consent: true,
  });
  if (!res.ok) return { kind: 'error', message: res.body?.error || 'Activation failed' };
  return { kind: 'pending', email: input.email };
}

/** Re-trigger the same POST to resend the confirmation (the route replays idempotently). */
export async function resendConfirmation(deps: SubmitDeps, url: '/api/auth/signup' | '/api/auth/activate-client', body: unknown): Promise<SubmitResult> {
  const res = await deps.postJson(url, body);
  if (!res.ok) return { kind: 'error', message: res.body?.error || 'Could not resend' };
  return { kind: 'pending', email: '' };
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

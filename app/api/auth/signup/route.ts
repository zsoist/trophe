import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';
import { reservationIdentity, ordinaryPseudoInvite, type ReservationPayload } from '@/lib/auth/reservation-identity';
import { buildSignupAuth, buildSignupDb } from '@/lib/auth/auth-admin';
import { runReservedSignup, type ClaimResult } from '@/lib/auth/signup-flow';

/**
 * Server-side signup (WP1) — reservation state machine + recovery-safe.
 *
 *   claim_{beta|ordinary} → createUser (app_metadata reservation tag, BANNED) → attach
 *   → finalize_{beta|ordinary} (atomic profile + Art.9 consent, reserved→completed)
 *   → enable (unban + confirm).  Compensation on any failure via cancel_reservation_for_route.
 *
 * Role is DERIVED from the locked invite (never client input). Explicit consent is
 * REQUIRED. Concurrent/retried requests converge on one reservation + one Auth user.
 */
const CONSENT_VERSION = '1.0';

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(1).max(120),
  inviteCode: z.string().trim().min(1).max(64).optional(),
  consent: z.literal(true), // Art.9 explicit consent — fail closed if absent (BLOCKER-03)
}).strict();

const MESSAGES: Record<string, string> = {
  invalid: 'Invalid or expired invite code',
  exhausted: 'This invite code has no remaining uses',
  conflict: 'A signup with these details is already in progress',
  email_exists: 'Email already registered. Try logging in.',
  retry: 'Signup is briefly busy — please try again',
  enable_failed: 'Account created but could not be enabled — please try logging in shortly',
  error: 'Signup failed',
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  const rate = await consumeRateLimit(`signup:${ip}`, 5, 3600);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many signups — please try again later' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });
  }

  try {
    const parsed = signupSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid email, an 8+ character password, your name, and consent are required' }, { status: 400 });
    }
    const { email, password, full_name, inviteCode } = parsed.data;
    const code = inviteCode?.trim();

    const service = createSupabaseServiceClient();
    const auth = buildSignupAuth(service);
    const db = buildSignupDb(service);

    const payload: ReservationPayload = { email, fullName: full_name, inviteCode: code ?? null, consentVersion: CONSENT_VERSION };
    const consentEvidence = { source: code ? 'signup:beta' : 'signup:ordinary', ip, capturedAt: new Date().toISOString() };

    let claim: ClaimResult;
    let role: 'client' | 'coach' | 'admin' = 'client';
    let finalize: (reservationId: string, userId: string) => Promise<boolean>;

    if (code) {
      const { idempotencyKey, fingerprint } = reservationIdentity(`beta:${code}`, email, payload);
      const { data, error } = await service.rpc('claim_beta_invite', { p_code: code, p_idem: idempotencyKey, p_fingerprint: fingerprint });
      if (error) throw new Error(`claim_beta_invite: ${error.message}`);
      const row = (data ?? [])[0] ?? { reservation_id: null, outcome: 'invalid', res_user_id: null, invite_role: null };
      claim = { reservationId: row.reservation_id, outcome: row.outcome, resUserId: row.res_user_id };
      if (row.invite_role === 'coach' || row.invite_role === 'admin') role = row.invite_role;
      finalize = async (res, uid) => {
        const { data: ok, error: e } = await service.rpc('finalize_beta_signup', { p_reservation_id: res, p_user_id: uid, p_full_name: full_name, p_email: email, p_consent_version: CONSENT_VERSION, p_consent_evidence: consentEvidence });
        if (e) throw new Error(`finalize_beta_signup: ${e.message}`);
        return ok === true;
      };
    } else {
      const { idempotencyKey, fingerprint } = reservationIdentity('ordinary', email, payload);
      const { data, error } = await service.rpc('claim_ordinary_signup', { p_pseudo_invite: ordinaryPseudoInvite(email), p_idem: idempotencyKey, p_fingerprint: fingerprint });
      if (error) throw new Error(`claim_ordinary_signup: ${error.message}`);
      const row = (data ?? [])[0] ?? { reservation_id: null, outcome: 'error', res_user_id: null };
      claim = { reservationId: row.reservation_id, outcome: row.outcome, resUserId: row.res_user_id };
      finalize = async (res, uid) => {
        const { data: ok, error: e } = await service.rpc('finalize_ordinary_signup', { p_reservation_id: res, p_user_id: uid, p_full_name: full_name, p_email: email, p_consent_version: CONSENT_VERSION, p_consent_evidence: consentEvidence });
        if (e) throw new Error(`finalize_ordinary_signup: ${e.message}`);
        return ok === true;
      };
    }

    const result = await runReservedSignup(auth, db, { claim, finalize, email, password, userMetadata: { full_name, role }, log: (m) => console.error('[signup]', m) });
    if (result.ok) return NextResponse.json({ success: true, user_id: result.userId });
    return NextResponse.json({ error: MESSAGES[result.reason] ?? 'Signup failed' }, { status: result.status });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

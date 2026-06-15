import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';
import { reservationIdentity, type ReservationPayload } from '@/lib/auth/reservation-identity';
import { buildSignupAuth, buildSignupDb } from '@/lib/auth/auth-admin';
import { runReservedSignup, type ClaimResult } from '@/lib/auth/signup-flow';

/**
 * Client activation via a coach invite token (WP1 plan B1, reservation state machine).
 *
 *   claim_client_invite → createUser (tagged, EMAIL-UNCONFIRMED) → attach →
 *   finalize_client_activation (atomic profile + client_profile linked to the inviting
 *   coach + Art.9 consent, reserved→completed) → sendConfirmation → 202 (or 503).
 *   Compensation via cancel_reservation_for_route. No ban (admin-only).
 *
 * Role is forced to 'client' and the coach link is DERIVED from the locked invite.
 */
const CONSENT_VERSION = '1.0';

const schema = z.object({
  token: z.string().uuid(),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(1).max(120),
  consent: z.literal(true), // Art.9 explicit consent is required to activate
}).strict();

const MESSAGES: Record<string, string> = {
  invalid: 'This invite is invalid or has expired. Ask your coach for a new link.',
  exhausted: 'This invite has already been used.',
  conflict: 'An activation with these details is already in progress',
  email_exists: 'Email already registered. Log in, then ask your coach to link you.',
  retry: 'Activation is briefly busy — please try again',
  delivery_failed: 'We could not send your confirmation email — please try again in a moment.',
  error: 'Activation failed',
};

/** GET ?token= → resolve the inviting coach's name (for the activation screen). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ valid: false }, { status: 400 });
  const service = createSupabaseServiceClient();
  const { data: invite } = await service
    .from('client_invites')
    .select('coach_id, status, expires_at, client_name')
    .eq('token', token)
    .maybeSingle();
  if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ valid: false });
  }
  const { data: coach } = await service.from('profiles').select('full_name').eq('id', invite.coach_id).maybeSingle();
  return NextResponse.json({ valid: true, coachName: coach?.full_name ?? 'your coach', clientName: invite.client_name ?? null });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = await consumeRateLimit(`activate-client:${ip}`, 10, 3600);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests — try again later' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });
  }

  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid invite, email, 8+ char password, name, and consent are required' }, { status: 400 });
    }
    const { token, email, password, full_name } = parsed.data;

    const service = createSupabaseServiceClient();
    const auth = buildSignupAuth(service);
    const db = buildSignupDb(service);

    // Bind the activation to the invited email (defense-in-depth; the authoritative,
    // transactional check is in finalize_client_activation, 0047). FAIL CLOSED on a lookup
    // error — a transient DB failure must not let the binding be skipped.
    const { data: inviteRow, error: inviteErr } = await service.from('client_invites').select('client_email').eq('token', token).maybeSingle();
    if (inviteErr) return NextResponse.json({ error: 'Could not validate the invite — please try again' }, { status: 503 });
    if (inviteRow?.client_email && inviteRow.client_email.trim().toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: 'This invite was issued for a different email address.' }, { status: 400 });
    }

    const payload: ReservationPayload = { email, fullName: full_name, inviteCode: token, consentVersion: CONSENT_VERSION };
    const consentEvidence = { source: 'client-activation', ip, capturedAt: new Date().toISOString() };

    const { idempotencyKey, fingerprint } = reservationIdentity(`client:${token}`, email, payload);
    const { data, error } = await service.rpc('claim_client_invite', { p_token: token, p_idem: idempotencyKey, p_fingerprint: fingerprint });
    if (error) throw new Error(`claim_client_invite: ${error.message}`);
    const row = (data ?? [])[0] ?? { reservation_id: null, outcome: 'invalid', res_user_id: null };
    const claim: ClaimResult = { reservationId: row.reservation_id, outcome: row.outcome, resUserId: row.res_user_id };

    const finalize = async (res: string, uid: string) => {
      const { data: ok, error: e } = await service.rpc('finalize_client_activation', { p_reservation_id: res, p_user_id: uid, p_full_name: full_name, p_email: email, p_consent_version: CONSENT_VERSION, p_consent_evidence: consentEvidence });
      if (e) throw new Error(`finalize_client_activation: ${e.message}`);
      return ok === true;
    };

    const result = await runReservedSignup(auth, db, { claim, finalize, email, password, userMetadata: { full_name, role: 'client' }, log: (m) => console.error('[activate-client]', m) });
    if (result.ok) return NextResponse.json({ verification_required: true, user_id: result.userId, message: 'Account created — check your email to confirm it, then sign in.' }, { status: result.status });
    return NextResponse.json({ error: MESSAGES[result.reason] ?? 'Activation failed' }, { status: result.status });
  } catch (err) {
    console.error('Client activation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

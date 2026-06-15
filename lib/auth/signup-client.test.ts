import { describe, it, expect } from 'vitest';
import { submitSignup, submitActivation, resendConfirmation, type SubmitDeps, type HttpResult } from '@/lib/auth/signup-client';

function mockDeps(res: HttpResult) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const deps: SubmitDeps = { async postJson(url, body) { calls.push({ url, body: body as Record<string, unknown> }); return res; } };
  return { deps, calls };
}
const ok202: HttpResult = { status: 202, ok: true, body: { verification_required: true } };
const err503: HttpResult = { status: 503, ok: false, body: { error: 'We could not send your confirmation email — please try again in a moment.' } };
const err400: HttpResult = { status: 400, ok: false, body: { error: 'Invalid or expired invite code' } };
const ok200success: HttpResult = { status: 200, ok: true, body: { success: true } };
const ok202empty: HttpResult = { status: 202, ok: true, body: {} };
const throwingDeps = (): SubmitDeps => ({ async postJson() { throw new Error('network down'); } });

describe('WP1 part 2 — signup-client browser contract', () => {
  it('signup sends consent:true + full_name + inviteCode', async () => {
    const { deps, calls } = mockDeps(ok202);
    await submitSignup(deps, { email: 'a@x.io', password: 'pw12345678', fullName: 'Ann', inviteCode: 'C', consent: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/auth/signup');
    expect(calls[0].body.consent).toBe(true);
    expect(calls[0].body.full_name).toBe('Ann');
    expect(calls[0].body.inviteCode).toBe('C');
  });

  it('signup 202 → pending and NEVER auto-logs-in (the result carries no session/redirect)', async () => {
    const { deps } = mockDeps(ok202);
    const r = await submitSignup(deps, { email: 'a@x.io', password: 'pw12345678', fullName: 'Ann', consent: true });
    expect(r).toEqual({ kind: 'pending', email: 'a@x.io' });
  });

  it('signup 503 delivery_failed → error (stays on the form, truthful message)', async () => {
    const { deps } = mockDeps(err503);
    const r = await submitSignup(deps, { email: 'a@x.io', password: 'pw12345678', fullName: 'Ann', consent: true });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toContain('confirmation email');
  });

  it('signup without consent fails closed — NO request is made', async () => {
    const { deps, calls } = mockDeps(ok202);
    const r = await submitSignup(deps, { email: 'a@x.io', password: 'pw12345678', fullName: 'Ann', consent: false });
    expect(r.kind).toBe('error');
    expect(calls).toHaveLength(0);
  });

  it('activation sends consent:true + token; 202 → pending; !ok → error; no-consent fails closed', async () => {
    const okD = mockDeps(ok202);
    const ra = await submitActivation(okD.deps, { token: 't', email: 'c@x.io', password: 'pw12345678', fullName: 'C', consent: true });
    expect(ra).toEqual({ kind: 'pending', email: 'c@x.io' });
    expect(okD.calls[0].url).toBe('/api/auth/activate-client');
    expect(okD.calls[0].body.consent).toBe(true);
    expect(okD.calls[0].body.token).toBe('t');

    const errD = mockDeps(err400);
    expect((await submitActivation(errD.deps, { token: 't', email: 'c@x.io', password: 'pw12345678', fullName: 'C', consent: true })).kind).toBe('error');

    const noConsent = mockDeps(ok202);
    expect((await submitActivation(noConsent.deps, { token: 't', email: 'c@x.io', password: 'pw12345678', fullName: 'C', consent: false })).kind).toBe('error');
    expect(noConsent.calls).toHaveLength(0);
  });

  it('resend → pending on success, error on failure', async () => {
    expect((await resendConfirmation(mockDeps(ok202).deps, '/api/auth/signup', {})).kind).toBe('pending');
    expect((await resendConfirmation(mockDeps(err503).deps, '/api/auth/signup', {})).kind).toBe('error');
  });

  it('network REJECTION → error (no unhandled rejection / stuck UI) for signup, activation, resend', async () => {
    expect((await submitSignup(throwingDeps(), { email: 'a@x.io', password: 'pw12345678', fullName: 'Ann', consent: true })).kind).toBe('error');
    expect((await submitActivation(throwingDeps(), { token: 't', email: 'c@x.io', password: 'pw12345678', fullName: 'C', consent: true })).kind).toBe('error');
    expect((await resendConfirmation(throwingDeps(), '/api/auth/signup', {})).kind).toBe('error');
  });

  it('strict success contract: 200{success} → error, 202{} → error, 202{verification_required} → pending', async () => {
    const input = { email: 'a@x.io', password: 'pw12345678', fullName: 'Ann', consent: true };
    expect((await submitSignup(mockDeps(ok200success).deps, input)).kind).toBe('error'); // a non-202 2xx is NOT success
    expect((await submitSignup(mockDeps(ok202empty).deps, input)).kind).toBe('error');   // 202 without the flag is NOT success
    expect((await submitSignup(mockDeps(ok202).deps, input)).kind).toBe('pending');       // only 202 + verification_required
  });
});

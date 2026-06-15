import { describe, it, expect } from 'vitest';
import { signupErrorMessage, confirmedLoginNotice } from '@/lib/auth/auth-messages';

describe('P1 activation/deliverability copy', () => {
  // `conflict` must NOT claim "already registered": claim_ordinary_signup returns conflict for a
  // concurrent/different-key in-progress request and a recovering reservation too — not only for an
  // existing account. (The genuine already-confirmed replay path is replayed_completed → 202, not
  // conflict.) So the copy stays generic and truthful for every conflict sub-case.
  it('conflict copy is GENERIC and does not assert an existing account or a login', () => {
    const msg = signupErrorMessage('conflict');
    expect(msg).toBe('A signup with these details is already in progress');
    expect(msg.toLowerCase()).not.toContain('already registered');
    expect(msg.toLowerCase()).not.toContain('log in');
  });

  it('email_exists IS the proven-existing-account case (Supabase rejected a duplicate createUser)', () => {
    expect(signupErrorMessage('email_exists')).toContain('already registered');
  });

  it('maps known reasons; unknown falls back', () => {
    expect(signupErrorMessage('delivery_failed')).toContain('confirmation email');
    expect(signupErrorMessage('invalid')).toBe('Invalid or expired invite code');
    expect(signupErrorMessage('exhausted')).toContain('no remaining uses');
    expect(signupErrorMessage('totally-unknown')).toBe('Signup failed');
  });

  it('confirmedLoginNotice fires ONLY for confirmed=1', () => {
    expect(confirmedLoginNotice('1')).toBe('Account confirmed — sign in to continue.');
    expect(confirmedLoginNotice('0')).toBeNull();
    expect(confirmedLoginNotice('true')).toBeNull();
    expect(confirmedLoginNotice(null)).toBeNull();
  });
});

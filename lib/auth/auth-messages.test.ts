import { describe, it, expect } from 'vitest';
import { signupErrorMessage, confirmedLoginNotice } from '@/lib/auth/auth-messages';

describe('P1 activation/deliverability copy', () => {
  it('ordinary conflict → "already registered, log in" (the completed-signup case)', () => {
    expect(signupErrorMessage('conflict', true)).toBe('This email is already registered — please log in.');
  });

  it('invite-path (beta/client) conflict KEEPS the generic "in progress" copy — not "already registered"', () => {
    const msg = signupErrorMessage('conflict', false);
    expect(msg).toContain('in progress');
    expect(msg).not.toContain('already registered');
  });

  it('other reasons map correctly regardless of path; unknown falls back', () => {
    expect(signupErrorMessage('delivery_failed', true)).toContain('confirmation email');
    expect(signupErrorMessage('email_exists', false)).toContain('already registered'); // existing copy, unchanged
    expect(signupErrorMessage('invalid', false)).toBe('Invalid or expired invite code');
    expect(signupErrorMessage('totally-unknown', true)).toBe('Signup failed');
  });

  it('confirmedLoginNotice fires ONLY for confirmed=1', () => {
    expect(confirmedLoginNotice('1')).toBe('Account confirmed — sign in to continue.');
    expect(confirmedLoginNotice('0')).toBeNull();
    expect(confirmedLoginNotice('true')).toBeNull();
    expect(confirmedLoginNotice(null)).toBeNull();
  });
});

import { expect, it } from 'vitest';
import { safeDiagnostic } from '@/scripts/test/run-coach-auth-e2e.mjs';

it('reports only the phase and SQLSTATE from a wrapped fixture error', () => {
  const cause = { code: '42501', message: 'credential-sentinel', query: 'private-query', detail: 'private-record' };
  expect(safeDiagnostic('profile_client', new Error('private-message', { cause }))).toEqual({
    event: 'coach_e2e_diagnostic', phase: 'profile_client', outcome: 'failed', sqlstate: '42501',
  });
});

it('reports a numeric Auth failure status without serializing a provider response', () => {
  expect(safeDiagnostic('auth_client', { status: 401, message: 'private-token', user: { email: 'private-email' } })).toEqual({
    event: 'coach_e2e_diagnostic', phase: 'auth_client', outcome: 'failed', authStatus: 401,
  });
});

it.each([{ code: 'secret-token', status: '401' }, { code: '42\n01', status: 401.5 }, { status: 200 }, { status: 600 }])('discards malformed diagnostic fields: %j', error => {
  expect(safeDiagnostic('untrusted-phase', error, 'untrusted-outcome')).toEqual({
    event: 'coach_e2e_diagnostic', phase: 'unknown', outcome: 'failed',
  });
});

it('keeps cleanup outcomes separate from the primary failure', () => {
  expect(safeDiagnostic('cleanup_commit', null, 'passed')).toEqual({
    event: 'coach_e2e_diagnostic', phase: 'cleanup_commit', outcome: 'passed',
  });
});

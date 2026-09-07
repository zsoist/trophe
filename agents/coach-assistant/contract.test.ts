import { describe, expect, it } from 'vitest';
import { requestSchema } from './schema';
import { authorizeSubject, windowFor } from './context';

describe('coach request authority', () => {
  it('accepts only the documented request fields', () => {
    expect(requestSchema.safeParse({ message: 'Today?', intent: 'today' }).success).toBe(true);
    for (const field of ['orgId', 'userId', 'role', 'fixtures', 'mode', 'startDate']) {
      expect(requestSchema.safeParse({ message: 'Today?', intent: 'today', [field]: 'forged' }).success).toBe(false);
    }
    expect(requestSchema.safeParse({ message: 'x'.repeat(2001), intent: 'today' }).success).toBe(false);
  });
  it('denies missing identity, foreign client, foreign org and unassigned professional', () => {
    const client = { id: 'a', role: 'client' as const, organizationIds: ['org-a'] };
    const subject = { id: 'a', coachId: 'coach', organizationIds: ['org-a'], timezone: 'America/Bogota', language: 'en' };
    expect(() => authorizeSubject(null, subject)).toThrow('unauthenticated');
    expect(() => authorizeSubject(client, { ...subject, id: 'b' })).toThrow('forbidden');
    const coach = { ...client, id: 'coach', role: 'coach' as const };
    expect(authorizeSubject(coach, subject).subjectId).toBe('a');
    expect(() => authorizeSubject(coach, { ...subject, organizationIds: ['org-b'] })).toThrow('forbidden');
    expect(() => authorizeSubject(coach, { ...subject, coachId: 'other' })).toThrow('forbidden');
    expect(() => authorizeSubject({ ...coach, role: 'super_admin' }, { ...subject, coachId: 'other' })).toThrow('forbidden');
  });
  it('derives calendar windows from the subject timezone including DST', () => {
    expect(windowFor('week', 'America/Bogota', new Date('2026-09-07T03:30:00Z'))).toMatchObject({ start: '2026-08-31', end: '2026-09-06', days: 7 });
    expect(windowFor('week', 'America/New_York', new Date('2026-03-09T03:30:00Z'))).toMatchObject({ start: '2026-03-02', end: '2026-03-08' });
    expect(() => windowFor('today', 'Invalid/Zone', new Date())).toThrow('invalid_timezone');
  });
});

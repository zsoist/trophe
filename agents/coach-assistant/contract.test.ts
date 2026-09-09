import { describe, expect, it } from 'vitest';
import { requestSchema } from './schema';
import { authorizeSubject,conversationScope,scopeConversationInput, windowFor, windowForConversation } from './context';

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
    expect(authorizeSubject(coach, subject)).toMatchObject({subjectId:'a',actorRole:'coach',access:'assigned_professional'});
    expect(() => authorizeSubject(coach, { ...subject, organizationIds: ['org-b'] })).toThrow('forbidden');
    expect(() => authorizeSubject(coach, { ...subject, coachId: 'other' })).toThrow('forbidden');
    expect(() => authorizeSubject({ ...coach, role: 'super_admin' }, { ...subject, coachId: 'other' })).toThrow('forbidden');
  });
  it('derives a distinct cache boundary per professional subject and drops cross-subject browser state',()=>{
    const coach={id:'coach',role:'coach',organizationIds:['org-a']};
    const a=authorizeSubject(coach,{id:'a',coachId:'coach',organizationIds:['org-a'],timezone:'UTC',language:'en'});
    const b=authorizeSubject(coach,{id:'b',coachId:'coach',organizationIds:['org-a'],timezone:'UTC',language:'en'});
    expect(conversationScope(a).scopeKey).not.toBe(conversationScope(b).scopeKey);
    const input={version:'coach-assistant.v2' as const,conversationId:'00000000-0000-4000-8000-000000000001',turnId:'00000000-0000-4000-8000-000000000002',message:'Review this client',context:{surface:'intake' as const,includeScreen:true,clientId:'00000000-0000-4000-8000-000000000003'},history:[{role:'assistant' as const,text:'Private history from another client'}],attachments:[{id:'00000000-0000-4000-8000-000000000004',kind:'image' as const,status:'available' as const}]};
    expect(scopeConversationInput(input,a)).toMatchObject({history:undefined,attachments:undefined});
  });
  it('derives calendar windows from the subject timezone including DST', () => {
    expect(windowFor('week', 'America/Bogota', new Date('2026-09-07T03:30:00Z'))).toMatchObject({ start: '2026-08-31', end: '2026-09-06', days: 7 });
    expect(windowFor('week', 'America/New_York', new Date('2026-03-09T03:30:00Z'))).toMatchObject({ start: '2026-03-02', end: '2026-03-08' });
    expect(() => windowFor('today', 'Invalid/Zone', new Date())).toThrow('invalid_timezone');
  });
  it('uses the visible Food date only for an included Food screen and Food domain',()=>{
    const input={version:'coach-assistant.v2' as const,conversationId:'00000000-0000-4000-8000-000000000001',turnId:'00000000-0000-4000-8000-000000000002',message:'What food is recorded?',context:{surface:'food' as const,includeScreen:true,screenDate:'2026-09-10'}};
    const now=new Date('2026-09-09T18:00:00Z');
    expect(windowForConversation(input,'week','food','America/Bogota',now)).toEqual({start:'2026-09-10',end:'2026-09-10',days:1,timezone:'America/Bogota'});
    expect(windowForConversation(input,'week','workout','America/Bogota',now)).toEqual(windowFor('week','America/Bogota',now));
    expect(windowForConversation({...input,context:{...input.context,includeScreen:false}},'week','food','America/Bogota',now)).toEqual(windowFor('week','America/Bogota',now));
    expect(windowForConversation({...input,context:{...input.context,surface:'progress'}},'week','food','America/Bogota',now)).toEqual(windowFor('week','America/Bogota',now));
    expect(windowForConversation({...input,context:{surface:'food',includeScreen:true}},'week','food','America/Bogota',now)).toEqual(windowFor('week','America/Bogota',now));
  });
});

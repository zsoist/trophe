import { expect, it } from 'vitest';
import { COACH_MESSAGE_REFRESH, readMessageRefresh } from '@/components/assistant/message-events';

it('accepts only a complete canonical human-chat refresh hint', () => {
  const detail = {
    coachId: '11111111-1111-4111-8111-111111111111',
    clientId: '22222222-2222-4222-8222-222222222222',
    messageId: '33333333-3333-4333-8333-333333333333',
    strategy: 'refetch',
  } as const;
  expect(readMessageRefresh(new CustomEvent(COACH_MESSAGE_REFRESH, { detail }))).toEqual(detail);
  expect(readMessageRefresh(new CustomEvent(COACH_MESSAGE_REFRESH, { detail: { ...detail, coachId: 'foreign' } }))).toBeNull();
  expect(readMessageRefresh(new Event(COACH_MESSAGE_REFRESH))).toBeNull();
});

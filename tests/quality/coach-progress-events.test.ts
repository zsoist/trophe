// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { COACH_PROGRESS_REFRESH, progressRefreshActor } from '@/components/assistant/progress-events';

it('accepts only a bounded actor identity from the Progress refresh event', () => {
  const actorId = crypto.randomUUID();
  expect(progressRefreshActor(new CustomEvent(COACH_PROGRESS_REFRESH, { detail: { actorId } }))).toBe(actorId);
  expect(progressRefreshActor(new CustomEvent(COACH_PROGRESS_REFRESH, { detail: { actorId: '../foreign' } }))).toBeNull();
  expect(progressRefreshActor(new Event(COACH_PROGRESS_REFRESH))).toBeNull();
});

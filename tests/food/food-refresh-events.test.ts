// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  COACH_FOOD_REFRESH,
  COACH_FOOD_REFRESH_DONE,
  readFoodRefreshDone,
  readFoodRefreshRequest,
  wasFoodRefreshRequestObserved,
} from '@/components/assistant/food-events';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('food refresh request observation', () => {
  it('reports no mounted consumer when nobody reads the dispatch', () => {
    const event = new CustomEvent(COACH_FOOD_REFRESH, { detail: { actorId: 'A', entryId: id(3), requestId: id(9) } });
    window.dispatchEvent(event);
    expect(wasFoodRefreshRequestObserved(event)).toBe(false);
  });

  it('reports a mounted consumer once it reads the request (host can require its completion)', () => {
    const event = new CustomEvent(COACH_FOOD_REFRESH, { detail: { actorId: 'A', entryId: id(3), requestId: id(9) } });
    const consumer = (e: Event) => { readFoodRefreshRequest(e); };
    window.addEventListener(COACH_FOOD_REFRESH, consumer);
    try {
      window.dispatchEvent(event);
    } finally {
      window.removeEventListener(COACH_FOOD_REFRESH, consumer);
    }
    expect(wasFoodRefreshRequestObserved(event)).toBe(true);
  });

  it('parses a bound request id and its completion, rejecting foreign signals', () => {
    const request = new CustomEvent(COACH_FOOD_REFRESH, { detail: { actorId: 'A', entryId: id(3), requestId: id(9) } });
    expect(readFoodRefreshRequest(request)).toEqual({ actorId: 'A', entryId: id(3), requestId: id(9) });
    const done = new CustomEvent(COACH_FOOD_REFRESH_DONE, { detail: { actorId: 'A', entryId: id(3), requestId: id(9), ok: true } });
    expect(readFoodRefreshDone(done)).toEqual({ actorId: 'A', entryId: id(3), requestId: id(9), ok: true });
    const foreign = new CustomEvent(COACH_FOOD_REFRESH, { detail: { actorId: 'A', entryId: id(3) } });
    expect(readFoodRefreshRequest(foreign)).toBeNull();
  });
});

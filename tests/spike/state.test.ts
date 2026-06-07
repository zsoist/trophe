import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpikeState, verifySpikeState } from '@/lib/spike/state';

describe('Spike OAuth state', () => {
  beforeEach(() => {
    process.env.WEARABLE_ENCRYPT_KEY = 'test-state-secret-with-at-least-32-chars';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.WEARABLE_ENCRYPT_KEY;
  });

  it('accepts a signed state for the expected user', async () => {
    const state = await createSpikeState('user-1', 'oura');
    await expect(verifySpikeState(state, 'user-1')).resolves.toEqual({ provider: 'oura' });
  });

  it('rejects tampered and cross-user states', async () => {
    const state = await createSpikeState('user-1', 'oura');
    await expect(verifySpikeState(`${state}x`, 'user-1')).resolves.toBeNull();
    await expect(verifySpikeState(state, 'user-2')).resolves.toBeNull();
  });

  it('rejects expired states', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
    const state = await createSpikeState('user-1', 'oura');
    vi.advanceTimersByTime(11 * 60 * 1000);
    await expect(verifySpikeState(state, 'user-1')).resolves.toBeNull();
  });
});

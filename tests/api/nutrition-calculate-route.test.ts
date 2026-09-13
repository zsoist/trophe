import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
}));

vi.mock('@/lib/security/durable-rate-limit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

import { POST } from '@/app/api/nutrition/calculate/route';
import { calculateFullProfile } from '@/lib/food/nutrition-engine';

async function post(body: unknown) {
  const request = new NextRequest('http://localhost/api/nutrition/calculate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const response = await POST(request);
  return { status: response.status, json: await response.json() };
}

const VALID = {
  weight_kg: 65,
  height_cm: 165,
  age: 35,
  sex: 'female',
  activity_level: 'moderate',
  goal: 'fat_loss',
} as const;

describe('POST /api/nutrition/calculate', () => {
  beforeEach(() => {
    mocks.consumeRateLimit.mockReset();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
  });

  it('returns the same profile the engine computes, with Atwater-consistent macros', async () => {
    const expected = calculateFullProfile(65, 165, 35, 'female', 'moderate', 'fat_loss');
    const { status, json } = await post(VALID);

    expect(status).toBe(200);
    expect(json.bmr).toBe(expected.bmr);
    expect(json.tdee).toBe(expected.tdee);
    expect(json.calories).toBe(expected.calories);
    expect(json.protein_g).toBe(expected.protein_g);
    expect(json.carbs_g).toBe(expected.carbs_g);
    expect(json.fat_g).toBe(expected.fat_g);

    const reconstructed = json.protein_g * 4 + json.carbs_g * 4 + json.fat_g * 9;
    expect(reconstructed).toBeLessThanOrEqual(json.calories);
    expect(json.calories - reconstructed).toBeLessThan(4);
  });

  it('rate-limits before doing any calculation', async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 42 });
    const { status, json } = await post(VALID);
    expect(status).toBe(429);
    expect(json.error).toBe('Too many requests');
  });

  it.each([
    { label: 'low weight', body: { ...VALID, weight_kg: 19 } },
    { label: 'high weight', body: { ...VALID, weight_kg: 301 } },
    { label: 'low height', body: { ...VALID, height_cm: 99 } },
    { label: 'fractional age', body: { ...VALID, age: 30.5 } },
    { label: 'unknown sex', body: { ...VALID, sex: 'other' } },
    { label: 'unknown activity', body: { ...VALID, activity_level: 'extreme' } },
    { label: 'unknown goal', body: { ...VALID, goal: 'bulk' } },
  ])('rejects unsupported profile values before computing ($label)', async ({ body }) => {
    const { status } = await post(body);
    expect(status).toBe(400);
  });

  it('rejects a missing body instead of throwing', async () => {
    const request = new NextRequest('http://localhost/api/nutrition/calculate', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

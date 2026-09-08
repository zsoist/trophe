import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/coach-assistant/voice/route';

const original = {
  enabled: process.env.COACH_ASSISTANT_ENABLED,
  voice: process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED,
  vercel: process.env.VERCEL_ENV,
};

afterEach(() => {
  process.env.COACH_ASSISTANT_ENABLED = original.enabled;
  process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED = original.voice;
  process.env.VERCEL_ENV = original.vercel;
});

describe('reviewed voice HTTP gate', () => {
  it('stays unavailable while its dedicated flag is off', async () => {
    process.env.COACH_ASSISTANT_ENABLED = '1'; delete process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED; delete process.env.VERCEL_ENV;
    const response = await POST(new Request('http://local/api/coach-assistant/voice', { method: 'POST' }) as never);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, status: 'error', error: 'not_connected' });
  });

  it('cannot be enabled in production by the preview flag', async () => {
    process.env.COACH_ASSISTANT_ENABLED = '1'; process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED = '1'; process.env.VERCEL_ENV = 'production';
    const response = await POST(new Request('http://local/api/coach-assistant/voice', { method: 'POST' }) as never);
    expect(response.status).toBe(404);
  });
});

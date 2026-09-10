import { afterEach, describe, expect, it } from 'vitest';
import { POST, PUT } from '@/app/api/coach-assistant/voice/route';

const original = {
  enabled: process.env.COACH_ASSISTANT_ENABLED,
  voice: process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED,
  vercel: process.env.VERCEL_ENV,
  fixture: process.env.COACH_ASSISTANT_VOICE_FIXTURE_ENABLED,
  ci: process.env.CI,
  actions: process.env.GITHUB_ACTIONS,
  chat: process.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED,
  publicChat: process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED,
};

afterEach(() => {
  process.env.COACH_ASSISTANT_ENABLED = original.enabled;
  process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED = original.voice;
  process.env.VERCEL_ENV = original.vercel;
  process.env.COACH_ASSISTANT_VOICE_FIXTURE_ENABLED = original.fixture;
  process.env.CI = original.ci;
  process.env.GITHUB_ACTIONS = original.actions;
  process.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED = original.chat;
  process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED = original.publicChat;
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

  it('rejects a public durable-voice mismatch before authentication or model dispatch', async () => {
    process.env.COACH_ASSISTANT_ENABLED = '1'; process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED = '1'; process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED = '1'; process.env.VERCEL_ENV = 'preview'; delete process.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED;
    const response = await POST(new Request('http://local/api/coach-assistant/voice', { method: 'POST' }) as never);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, status: 'error', error: 'not_connected' });
  });

  it('keeps the transcript fixture unavailable outside the explicit CI boundary', async () => {
    process.env.COACH_ASSISTANT_ENABLED = '1'; process.env.COACH_ASSISTANT_VOICE_FIXTURE_ENABLED = '1';
    process.env.CI = 'true'; delete process.env.GITHUB_ACTIONS; delete process.env.VERCEL_ENV;
    expect((await PUT(new Request('http://local/api/coach-assistant/voice', { method: 'PUT' }) as never)).status).toBe(404);
    process.env.GITHUB_ACTIONS = 'true'; process.env.VERCEL_ENV = 'production';
    expect((await PUT(new Request('http://local/api/coach-assistant/voice', { method: 'PUT' }) as never)).status).toBe(404);
  });
});

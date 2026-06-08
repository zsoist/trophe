import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const processMemoryQueue = vi.fn();
vi.mock('@/agents/memory/queue', () => ({ processMemoryQueue }));

describe('durable memory queue', () => {
  beforeEach(() => {
    processMemoryQueue.mockReset();
    delete process.env.CRON_SECRET;
  });

  it('claims work atomically with leases, SKIP LOCKED, and bounded attempts', () => {
    const source = readFileSync(join(process.cwd(), 'agents/memory/queue.ts'), 'utf8');
    expect(source).toContain('FOR UPDATE SKIP LOCKED');
    expect(source).toContain('processing_attempts < ${MAX_ATTEMPTS}');
    expect(source).toContain('processing_started_at < now()');
    expect(source).toContain('next_attempt_at');
  });

  it('rejects cron requests without the configured bearer secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const { GET } = await import('@/app/api/internal/memory-worker/route');
    const response = await GET(new NextRequest('https://trophe.app/api/internal/memory-worker'));
    expect(response.status).toBe(401);
    expect(processMemoryQueue).not.toHaveBeenCalled();
  });

  it('processes the queue for an authorized cron request', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    processMemoryQueue.mockResolvedValue({ claimed: 2, completed: 2, failed: 0, deadLettered: 0 });
    const { GET } = await import('@/app/api/internal/memory-worker/route');
    const response = await GET(new NextRequest('https://trophe.app/api/internal/memory-worker', {
      headers: { authorization: 'Bearer cron-secret' },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: 2, completed: 2, failed: 0, deadLettered: 0 });
  });
});

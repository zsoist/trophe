import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('disposable durable coach runner', () => {
  it('bypasses the shared AI request window only for its disposable actor', () => {
    const source = readFileSync('scripts/test/coach-durable-sql.ts', 'utf8');
    const httpEnv = source.slice(source.indexOf('const httpEnv ='), source.indexOf('const http = spawnSync'));

    expect(httpEnv).toContain('AI_RATE_LIMIT_BYPASS_USER_IDS: actorId');
    expect(httpEnv).not.toMatch(/AI_RATE_LIMIT_BYPASS_USER_IDS:\s*['"`]/);
  });
});

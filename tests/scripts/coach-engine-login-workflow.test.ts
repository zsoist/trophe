import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('focused isolated engine Auth workflow', () => {
  it('uses one exclusive loopback disposable selector with paid requests blocked by the engine spec', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    const runner = readFileSync('scripts/test/run-coach-engine-login.mjs', 'utf8');
    const spec = readFileSync('e2e/coach-engine.spec.ts', 'utf8');

    expect(workflow).toContain('coach_engine_only:');
    expect(workflow).toContain('if: ${{ inputs.coach_engine_only }}');
    for (const selector of ['coach_auth_only', 'coach_login_diagnostic_only', 'coach_durable_only']) {
      expect(workflow).toContain(`inputs.${selector} && inputs.coach_engine_only`);
    }
    expect(runner).toContain("process.env.GITHUB_ACTIONS !== 'true'");
    expect(runner).toContain("db.hostname !== '127.0.0.1'");
    expect(runner).toContain("api.hostname !== '127.0.0.1'");
    expect(runner).toContain("'e2e/coach-engine.spec.ts'");
    expect(runner).toContain("COACH_ASSISTANT_MODE: 'offline'");
    expect(runner).toContain('AI_RATE_LIMIT_BYPASS_USER_IDS: actors.clientId');
    expect(spec).toContain('const noPaid = await blockPaidRequests(page)');
    expect(spec).toContain('noPaid()');
  });
});

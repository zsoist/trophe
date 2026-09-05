import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production read-only canary', () => {
  it('is directly executable and stops at the paid-operation guard by default', () => {
    const canary = join(process.cwd(), 'scripts/ops/canary-readonly.sh');
    const source = readFileSync(canary, 'utf8');
    expect(source.startsWith('#!/usr/bin/env bash\n')).toBe(true);

    // Invoke the file itself so this test protects the shebang and executable
    // bit; `bash <file>` would let a broken script pass unnoticed.
    const result = spawnSync(canary, [], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('canary-production-ai-route:tool-opt-in-required');
    expect(result.stderr).not.toContain('command not found');
  });
});

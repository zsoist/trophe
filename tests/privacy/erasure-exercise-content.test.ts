import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('client-created exercise erasure contract', () => {
  it('scrubs authored exercise text instead of retaining it behind a nulled owner', () => {
    const source = readFileSync(join(process.cwd(), 'lib/privacy/erasure.ts'), 'utf8');

    expect(source).toContain("name: 'Deleted exercise'");
    expect(source).toContain('name_es: null');
    expect(source).toContain('name_el: null');
    expect(source).toContain('instructions: null');
    expect(source).toContain('instructions_es: null');
    expect(source).toContain('instructions_el: null');
    expect(source).toContain("exercises (content scrub)");
  });
});

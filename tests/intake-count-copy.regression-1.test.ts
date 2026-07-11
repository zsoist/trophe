import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: STAB-004 — the intake promised 12 questions but rendered 15
// Found by /qa on 2026-07-10
describe('intake question-count copy', () => {
  it.each(['app/dashboard/page.tsx', 'app/dashboard/intake/page.tsx'])(
    '%s promises the actual 15-step intake',
    (file) => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/Twelve questions|12-step/);
      expect(source).toMatch(/Fifteen questions|15-step/);
    },
  );
});

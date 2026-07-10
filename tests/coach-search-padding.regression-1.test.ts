import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: STAB-005 — .input-dark padding overrode pl-10 and covered the placeholder
// Found by /qa on 2026-07-10
describe('coach client search field', () => {
  it('reserves enough inline space for its absolute search icon', () => {
    const source = readFileSync(join(process.cwd(), 'app/coach/page.tsx'), 'utf8');
    const searchInput = source.slice(source.indexOf('placeholder="Search clients..."'), source.indexOf('placeholder="Search clients..."') + 300);

    expect(searchInput).toContain('style={{ paddingLeft: 40 }}');
  });
});

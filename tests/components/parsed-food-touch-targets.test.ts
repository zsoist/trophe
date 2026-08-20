import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('parsed food review touch targets', () => {
  it('keeps provenance, removal, and uncertainty actions above the browser 44px rounding floor', () => {
    const ring = readFileSync(join(process.cwd(), 'components/food/ProvenanceRing.tsx'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

    expect(ring).toContain('minWidth: 45');
    expect(ring).toContain('minHeight: 45');
    expect(styles).toMatch(/\.portion-review-remove\s*\{[\s\S]*?width:\s*45px;[\s\S]*?height:\s*45px;/);
    expect(styles).toMatch(/\.portion-review-secondary-action\s*\{[\s\S]*?min-height:\s*45px;/);
  });
});

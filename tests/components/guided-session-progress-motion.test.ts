import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const guidedSession = readFileSync(
  join(process.cwd(), 'components/workout/GuidedSession.tsx'),
  'utf8',
);

describe('GuidedSession progress motion', () => {
  it('keeps both progress fills compositor-safe and disables their transition for reduced motion', () => {
    expect(guidedSession).not.toMatch(/transition:\s*['"]width\b/);
    expect(guidedSession).not.toMatch(/animate=\{\{\s*width:/);

    const progressScales = guidedSession.match(/transform:\s*`scaleX\(\$\{[^}]+\}\)`/g) ?? [];
    const animatedProgressScales = guidedSession.match(/animate=\{\{\s*scaleX:/g) ?? [];
    const leftOrigins = guidedSession.match(/transformOrigin:\s*['"]left center['"]/g) ?? [];
    expect(progressScales).toHaveLength(1);
    expect(animatedProgressScales).toHaveLength(1);
    expect(leftOrigins).toHaveLength(2);

    expect(guidedSession).toContain("const reducedMotion = useReducedMotion();");
    expect(guidedSession).toMatch(/transition:\s*reducedMotion\s*\?\s*['"]none['"]\s*:\s*['"]transform/);
    expect(guidedSession).toMatch(/duration:\s*reducedMotion\s*\?\s*0\s*:\s*0\.35/);
  });
});

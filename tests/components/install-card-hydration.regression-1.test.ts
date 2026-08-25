import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: STAB-006 — iOS detection rendered an install dialog only on the
// first client pass, causing a dashboard hydration mismatch.
describe('InstallCard hydration gate', () => {
  const source = readFileSync(join(process.cwd(), 'components/shared/InstallCard.tsx'), 'utf8');
  const layout = readFileSync(join(process.cwd(), 'app/dashboard/layout.tsx'), 'utf8');

  it('uses matching server/client hydration snapshots before browser-only UI renders', () => {
    expect(source).toContain('useSyncExternalStore');
    expect(source).toContain('() => true, () => false');
    expect(source).toContain('hydrated && (canInstall || isIOS)');
  });

  it('keeps the optional install offer in document flow before core route content', () => {
    expect(source).not.toContain('position: "fixed"');
    expect(source).not.toContain('zIndex: 9999');
    expect(layout).toMatch(/id="main-content"[\s\S]*<InstallCard \/>[\s\S]*\{children\}/);
  });
});

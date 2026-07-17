import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('landing-page delivery budget', () => {
  it('does not prefetch login or pricing routes during the initial landing load', () => {
    const source = readFileSync(join(root, 'app/page.tsx'), 'utf8');
    const internalCtaLinks = source.match(/<Link\b[\s\S]*?<\/Link>/g)?.filter((link) =>
      /href="\/(?:login|pricing)/.test(link),
    ) ?? [];

    expect(internalCtaLinks.length).toBeGreaterThan(0);
    for (const link of internalCtaLinks) {
      expect(link).toContain('prefetch={false}');
    }
  });

  it('keeps authenticated app providers out of the public root layout', () => {
    const rootLayout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
    expect(rootLayout).not.toContain('components/shared/Providers');
    expect(rootLayout).not.toMatch(/<Providers\b/);
    expect(rootLayout).toContain('components/shared/ErrorBoundary');
    expect(rootLayout).toMatch(/<ErrorBoundary\b/);

    for (const area of ['dashboard', 'coach', 'admin', 'super', 'onboarding']) {
      const layout = readFileSync(join(root, `app/${area}/layout.tsx`), 'utf8');
      expect(layout).toContain('components/shared/Providers');
      expect(layout).toMatch(/<Providers\b/);
    }
  });

  it('does not hide above-the-fold content behind entrance animations', () => {
    const source = readFileSync(join(root, 'app/page.tsx'), 'utf8');
    const hero = source.slice(source.indexOf('{/* ─── Hero ─── */}'), source.indexOf('{/* ─── Features'));

    expect(hero).not.toContain('animate-[fadeUp_');
  });
});

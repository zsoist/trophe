import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LANDING_LANGUAGE_ROUTES,
  landingLanguageHref,
} from '@/lib/landing-language';

const root = process.cwd();

describe('landing-page delivery budget', () => {
  it('uses concrete canonical routes for every supported public language', () => {
    expect(LANDING_LANGUAGE_ROUTES).toEqual({
      en: '/',
      es: '/es',
      el: '/el',
    });
    expect(landingLanguageHref('en')).toBe('/');
    expect(landingLanguageHref('es')).toBe('/es');
    expect(landingLanguageHref('el')).toBe('/el');
  });

  it('keeps all landing routes and shared content on the server', () => {
    for (const routeFile of ['app/page.tsx', 'app/es/page.tsx', 'app/el/page.tsx']) {
      const source = readFileSync(join(root, routeFile), 'utf8');
      expect(source).not.toMatch(/['"]use client['"]/);
      expect(source).toContain('components/landing/LandingPage');
      expect(source).not.toMatch(/\b(?:cookies|headers|useSearchParams)\s*\(/);
    }

    const landing = readFileSync(join(root, 'components/landing/LandingPage.tsx'), 'utf8');
    const languageLinks = readFileSync(join(root, 'components/landing/LanguageLinks.tsx'), 'utf8');
    expect(landing).not.toMatch(/['"]use client['"]/);
    expect(languageLinks).not.toMatch(/['"]use client['"]/);
    expect(landing).not.toContain('useState');
    expect(landing).not.toContain('setLang');
  });

  it('does not prefetch login or pricing routes during the initial landing load', () => {
    const source = readFileSync(join(root, 'components/landing/LandingPage.tsx'), 'utf8');
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
    const source = readFileSync(join(root, 'components/landing/LandingPage.tsx'), 'utf8');
    const hero = source.slice(source.indexOf('{/* ─── Hero ─── */}'), source.indexOf('{/* ─── Features'));

    expect(hero).not.toContain('animate-[fadeUp_');
  });
});

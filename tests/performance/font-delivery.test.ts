import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('public font delivery', () => {
  it('does not globally preload route-selected sans and display variants', () => {
    const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
    const interConfig = layout.slice(layout.indexOf('const inter'), layout.indexOf('const instrumentSerif'));
    const instrumentConfig = layout.slice(
      layout.indexOf('const instrumentSerif'),
      layout.indexOf('const jetbrainsMono'),
    );

    expect(interConfig).toContain('subsets: ["latin", "greek"]');
    expect(interConfig).toContain('preload: false');
    expect(instrumentConfig).toContain('style: ["normal", "italic"]');
    expect(instrumentConfig).toContain('preload: false');
  });

  it('keeps JetBrains Mono out of every marketing-only element', () => {
    const landing = readFileSync(join(root, 'components/landing/LandingPage.tsx'), 'utf8');

    expect(landing).not.toContain('font-mono');
  });

  it('isolates multilingual footer-only glyphs from the English Inter subsets', () => {
    const landing = readFileSync(join(root, 'components/landing/LandingPage.tsx'), 'utf8');

    expect(landing.match(/font-\[system-ui\]/g) ?? []).toHaveLength(2);
  });

  it('preserves Greek sans support and the italic brand treatment', () => {
    const landing = readFileSync(join(root, 'components/landing/LandingPage.tsx'), 'utf8');

    expect(landing).toContain("lang !== 'el' ? 'display-hero");
    expect(landing).toMatch(/font-serif italic[^"]*"[^>]*>[\s\S]*?trophē/);
  });
});

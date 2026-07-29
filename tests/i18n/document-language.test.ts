import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const layoutSource = readFileSync(join(root, 'app/layout.tsx'), 'utf8');
const languageSource = readFileSync(
  join(root, 'components/shared/DocumentLanguage.tsx'),
  'utf8',
);

describe('document language and local analytics delivery', () => {
  it('sets the initial document language before hydration', () => {
    expect(layoutSource).toContain("location.pathname.split('/')[1]");
    expect(layoutSource).toContain("p==='es'||p==='el'?p:'en'");
  });

  it('keeps the document language in sync after client navigation', () => {
    expect(languageSource).toContain("usePathname");
    expect(languageSource).toContain("document.documentElement.lang");
    expect(layoutSource).toContain('<DocumentLanguage />');
  });

  it('does not load Vercel Analytics debug scripts during local QA', () => {
    expect(layoutSource).toContain(
      'process.env.NODE_ENV === \"production\" && <Analytics />',
    );
  });
});

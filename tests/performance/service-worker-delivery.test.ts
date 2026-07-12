import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('service-worker delivery budget', () => {
  it('registers only inside the authenticated app and precaches only the offline fallback', () => {
    const config = read('next.config.ts');

    expect(config).toMatch(/register:\s*false/);
    expect(config).toMatch(/reloadOnOnline:\s*false/);
    expect(config).toMatch(/exclude:\s*\[\/\.\*\/\]/);
    expect(config).toMatch(/url:\s*["']\/offline\.html["']/);
    expect(config).toMatch(/revision:\s*offlineHtmlRevision/);

    const offline = read('public/offline.html');
    expect(offline).not.toMatch(/<script\b/i);
    expect(offline).not.toMatch(/\son\w+\s*=/i);
    expect(offline).not.toMatch(/<link\b[^>]+rel=["'](?:stylesheet|preload)/i);
    expect(offline).toContain('lang="el"');
  });

  it('never caches application HTML, RSC payloads, or API responses', () => {
    const worker = read('app/sw.ts');

    expect(worker).not.toContain('defaultCache');
    expect(worker).not.toContain('NetworkFirst');
    expect(worker).toMatch(/skipWaiting:\s*false/);
    expect(worker).toMatch(/matcher:\s*\(context\)\s*=>\s*mustUseNetwork\(context\)[\s\S]{0,100}new NetworkOnly/);
    expect(worker).toContain('RETIRED_RUNTIME_CACHES');
    expect(worker).toContain('pages-rsc');
    expect(worker).toContain('pages-rsc-prefetch');
    expect(worker).toContain('CURRENT_SW_GENERATION_CACHE');
    expect(worker).toMatch(/addEventListener\(["']install["'][\s\S]+caches\.has\(CURRENT_SW_GENERATION_CACHE\)[\s\S]+self\.skipWaiting\(\)/);
    expect(worker).toMatch(/addEventListener\(["']activate["'][\s\S]+caches\.open\(CURRENT_SW_GENERATION_CACHE\)/);
  });

  it('reloads only after a user accepts an update and removes lifecycle listeners', () => {
    const registration = read('components/shared/SWRegistration.tsx');

    expect(registration).toContain('useRef(false)');
    expect(registration).toContain('reloadRequested.current = true');
    expect(registration).toContain('registeredWorker.installing');
    expect(registration).toContain('watchInstallingWorker(registeredWorker.installing)');
    expect(registration).toContain("removeEventListener('controllerchange'");
    expect(registration).toContain("removeEventListener('updatefound'");
    expect(registration).toContain("console.error('[service-worker] registration failed'");

    const gitignore = read('.gitignore');
    expect(gitignore).toContain('public/sw.js');
    expect(gitignore).toContain('public/swe-worker-*.js');
  });
});

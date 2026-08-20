import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('service-worker delivery budget', () => {
  it('keeps serwist bundling wired and precaches only the offline fallback', () => {
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
    expect(offline).toContain('<html lang="en">');
    expect(offline).not.toMatch(/[\u0370-\u03ff]/u);
  });

  it('ships a self-destructing worker — no runtime caching, unregisters + purges', () => {
    // 2026-07-12: the runtime-caching worker was retired (iOS Safari ~1-min
    // loads). app/sw.ts must now take over immediately, purge every cache, and
    // unregister itself so the origin serves pure static + network.
    const worker = read('app/sw.ts');

    // No serwist caching runtime remains (check real code, not prose).
    expect(worker).not.toContain('from "serwist"');
    expect(worker).not.toContain('new Serwist');
    expect(worker).not.toContain('runtimeCaching:');
    expect(worker).not.toContain('precacheEntries');

    // Self-destruct lifecycle.
    expect(worker).toContain('self.skipWaiting()');
    expect(worker).toMatch(/addEventListener\(["']activate["']/);
    expect(worker).toContain('self.registration.unregister()');
    expect(worker).toMatch(/caches\.keys\(\)[\s\S]{0,240}caches\.delete/);
  });

  it('no longer registers a worker from the app (devices self-heal)', () => {
    const registration = read('components/shared/SWRegistration.tsx');

    // The component is now a no-op: it must NOT register a worker, so an old
    // worker is never re-created — the browser's own /sw.js re-check applies the
    // self-destruct worker to devices that still have one.
    expect(registration).toContain('return null');
    expect(registration).not.toContain('navigator.serviceWorker.register');

    const gitignore = read('.gitignore');
    expect(gitignore).toContain('public/sw.js');
    expect(gitignore).toContain('public/swe-worker-*.js');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  cspAllowsClassicEval,
  MEDIAPIPE_MODEL_ORIGIN,
  MEDIAPIPE_WASM_ORIGIN,
} from '@/lib/security/csp';

const prod = buildContentSecurityPolicy({ isDev: false, supabaseOrigin: 'https://example.supabase.co' });
const dev = buildContentSecurityPolicy({ isDev: true, supabaseOrigin: 'http://127.0.0.1:54321' });

function directive(csp: string, name: string): string {
  const found = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `) || part === name);
  if (!found) throw new Error(`directive ${name} missing from: ${csp}`);
  return found;
}

describe('Content-Security-Policy', () => {
  it('lets AI Form Check load the MediaPipe runtime and model in production (SEC-1)', () => {
    const connect = directive(prod, 'connect-src');
    expect(connect).toContain(MEDIAPIPE_WASM_ORIGIN);
    expect(connect).toContain(MEDIAPIPE_MODEL_ORIGIN);
    expect(directive(prod, 'script-src')).toContain("'wasm-unsafe-eval'");
    expect(directive(prod, 'script-src')).toContain(MEDIAPIPE_WASM_ORIGIN);
  });

  it('keeps classic eval out of production while allowing it in dev for React devtools', () => {
    expect(cspAllowsClassicEval(prod)).toBe(false);
    expect(cspAllowsClassicEval(dev)).toBe(true);
    expect(cspAllowsClassicEval("script-src 'self' 'wasm-unsafe-eval'")).toBe(false);
  });

  it('keeps AI provider hosts out of connect-src (anti-exfiltration)', () => {
    const connect = directive(prod, 'connect-src');
    for (const host of ['anthropic.com', 'generativelanguage.googleapis.com', 'deepseek.com']) {
      expect(connect).not.toContain(host);
    }
  });

  it('includes the Supabase REST and realtime origins', () => {
    const connect = directive(prod, 'connect-src');
    expect(connect).toContain('https://example.supabase.co');
    expect(connect).toContain('wss://example.supabase.co');
    expect(directive(dev, 'connect-src')).toContain('ws://127.0.0.1:54321');
  });

  it('adds the baseline hardening directives', () => {
    expect(directive(prod, 'object-src')).toBe("object-src 'none'");
    expect(directive(prod, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(prod, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(prod, 'media-src')).toContain('blob:');
    expect(directive(prod, 'worker-src')).toContain('blob:');
  });

  it('is the policy next.config.ts ships and the URLs FormCheck actually fetches', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(config).toContain("from './lib/security/csp'");
    expect(config).toContain('buildContentSecurityPolicy({ isDev, supabaseOrigin })');
    expect(config).not.toContain('"connect-src');

    const formCheck = readFileSync(join(process.cwd(), 'components/workout/FormCheck.tsx'), 'utf8');
    for (const url of formCheck.match(/https:\/\/[^'"`\s]+/g) ?? []) {
      const origin = new URL(url).origin;
      expect([MEDIAPIPE_WASM_ORIGIN, MEDIAPIPE_MODEL_ORIGIN], `FormCheck fetches ${origin} which the CSP does not allow`).toContain(origin);
    }
  });

  it('production canary rejects only classic eval, not wasm-unsafe-eval', () => {
    const canary = readFileSync(join(process.cwd(), 'scripts/ops/canary-readonly.sh'), 'utf8');
    expect(canary).not.toContain('*"unsafe-eval"*');
    expect(canary).toContain("'unsafe-eval'");
    expect(canary).toContain('wasm-unsafe-eval');
    expect(canary).toContain('storage.googleapis.com');
  });
});

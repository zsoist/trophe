import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts?: Record<string, string>;
};
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');
const bootstrapScript = readFileSync('scripts/db/bootstrap-local.sh', 'utf8');
const doctorScript = readFileSync('scripts/db/doctor.ts', 'utf8');

describe('Nick local development contract', () => {
  it('provides a one-command local launch that derives Supabase credentials', () => {
    expect(packageJson.scripts?.['dev:local']).toBe('node scripts/dev/run-local.mjs');
    expect(packageJson.scripts?.['test:e2e:local-signup']).toBe(
      'node scripts/test/run-local-signup-e2e.mjs',
    );
    expect(readFileSync('scripts/dev/run-local.mjs', 'utf8')).toContain(
      "buildLocalDevEnv",
    );
    expect(readFileSync('scripts/dev/run-local.mjs', 'utf8')).toContain(
      "'--webpack'",
    );
  });

  it('routes local confirmation emails through the public Auth gateway', () => {
    expect(supabaseConfig).toMatch(
      /external_url\s*=\s*"http:\/\/127\.0\.0\.1:54321\/auth\/v1"/,
    );
  });

  it('allows both the canonical and QA local app origins', () => {
    expect(supabaseConfig).toContain('"http://127.0.0.1:3000"');
    expect(supabaseConfig).toContain('"http://127.0.0.1:3300"');
  });

  it('uses installed local binaries without recursively invoking npm', () => {
    expect(bootstrapScript).not.toMatch(/\bnpx\s+(?:supabase|tsx)\b/);
    expect(doctorScript).not.toMatch(/\bnpx\s+supabase\b/);
  });
});

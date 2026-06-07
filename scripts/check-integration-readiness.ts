import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const required = {
  core: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'DATABASE_URL'],
  ai: ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'VOYAGE_API_KEY'],
  observability: ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_HOST'],
  wearable_on_hold: ['SPIKE_CLIENT_ID', 'SPIKE_CLIENT_SECRET', 'SPIKE_WEBHOOK_SECRET', 'WEARABLE_ENCRYPT_KEY'],
} as const;

let missingRequired = false;

for (const [capability, variables] of Object.entries(required)) {
  const configured = variables.filter((name) => Boolean(process.env[name]));
  const missing = variables.filter((name) => !process.env[name]);
  const isRequired = capability === 'core' || capability === 'ai';
  if (isRequired && missing.length > 0) missingRequired = true;

  console.log(`${capability}: ${configured.length}/${variables.length} configured`);
  if (missing.length > 0) console.log(`  missing: ${missing.join(', ')}`);
}

if (missingRequired) process.exitCode = 1;

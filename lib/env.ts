/** Normalize values copied from shell/Vercel env files without hiding missing config. */
export function requiredEnv(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  const trimmed = value.trim();
  const isWrapped = trimmed.length >= 2 && (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  );
  const normalized = isWrapped ? trimmed.slice(1, -1).trim() : trimmed;

  if (!normalized) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return normalized;
}

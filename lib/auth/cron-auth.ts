/**
 * Bearer-token auth for Supabase pg_cron → pg_net workers (P2: per-worker secret isolation).
 *
 * Accepts ANY of the supplied non-empty secrets, so each worker carries its OWN secret
 * (e.g. RECOVERY_CRON_SECRET, MEMORY_CRON_SECRET) while still honoring the legacy SHARED
 * CRON_SECRET during cutover — rotating one worker's secret then can't disrupt the others.
 * Once the shared secret is removed from the env it's `undefined` and silently ignored here,
 * so the backward-compat fallback self-disables with no further code change.
 */
export function cronBearerValid(authHeader: string | null, ...secrets: Array<string | undefined>): boolean {
  if (!authHeader) return false;
  return secrets.some((s) => !!s && authHeader === `Bearer ${s}`);
}

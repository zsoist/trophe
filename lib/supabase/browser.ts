'use client';

import { createBrowserClient } from '@supabase/ssr';
import { requiredEnv } from '@/lib/env';

/**
 * Browser Supabase client — Phase 2.
 *
 * Replaces the old `createClient()` singleton in `lib/supabase.ts`. Uses
 * `@supabase/ssr` which stores the session in cookies (not localStorage), so
 * the server-side client can read the same session without an extra round-trip.
 *
 * Usage (client components):
 *   import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
 *   const supabase = createSupabaseBrowserClient();
 *
 * Note: create a new client per call — `@supabase/ssr` memoises internally.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    requiredEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}

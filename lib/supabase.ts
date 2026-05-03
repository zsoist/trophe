'use client';

/**
 * Trophē — Supabase client (backward-compat shim).
 *
 * Phase 2 split the single createClient() into:
 *   lib/supabase/browser.ts  — client components
 *   lib/supabase/server.ts   — server components / route handlers
 *   lib/supabase/middleware.ts — edge middleware
 *
 * This file keeps the old `supabase` named export alive so the 60+ existing
 * client components that `import { supabase } from '@/lib/supabase'` don't
 * need a mass-rename during this phase. They now get the SSR-aware browser
 * client (cookies instead of localStorage).
 *
 * TODO Phase 8: remove this shim during the UI overhaul — each component
 * should directly import `createSupabaseBrowserClient` instead.
 */
export { createSupabaseBrowserClient } from './supabase/browser';

// Legacy singleton — satisfies existing `import { supabase }` calls.
// createSupabaseBrowserClient() is memoised internally by @supabase/ssr.
import { createSupabaseBrowserClient } from './supabase/browser';
export const supabase = createSupabaseBrowserClient();

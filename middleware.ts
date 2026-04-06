// Middleware disabled — Supabase JS v2 stores auth in localStorage, not cookies.
// Auth protection is handled client-side in each page component.
// To enable server-side auth, install @supabase/ssr and use createServerClient.

import { NextResponse, type NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};

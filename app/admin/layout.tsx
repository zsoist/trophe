import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const ADMIN_EMAILS = ['daniel@reyes.com'];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Try to get auth from any Supabase auth cookie
  const cookieStore = await cookies();
  const authCookie = cookieStore.getAll().find(c => c.name.includes('auth-token'));

  if (!authCookie?.value) redirect('/login');

  // Extract token from Supabase v2 cookie format
  let token: string | null = null;
  try {
    const chunks = cookieStore.getAll().filter(c => c.name.includes('auth-token')).sort((a, b) => a.name.localeCompare(b.name));
    const raw = chunks.map(c => c.value).join('');
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    token = Array.isArray(decoded) ? decoded[0] : decoded?.access_token;
  } catch {
    // Try URL-encoded
    try {
      const raw = decodeURIComponent(authCookie.value);
      const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      token = Array.isArray(decoded) ? decoded[0] : decoded?.access_token;
    } catch {
      redirect('/login');
    }
  }

  if (!token) redirect('/login');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } });

  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}

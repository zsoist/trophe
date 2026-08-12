import { redirect } from 'next/navigation';
import Providers from '@/components/shared/Providers';
import { getSession, roleAtLeast } from '@/lib/auth/get-session';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roleAtLeast(session.role, 'admin')) redirect('/dashboard');

  return (
    <Providers>
      <AdminShell
        title="Administration"
        eyebrow="Admin"
        actions={(
          <nav aria-label="Admin shortcuts" className="hidden items-center gap-3 sm:flex">
            <Link
              href="/admin/orgs"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              Organizations
            </Link>
            <Link
              href="/admin/costs"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              AI costs
            </Link>
          </nav>
        )}
      >
        {children}
      </AdminShell>
    </Providers>
  );
}

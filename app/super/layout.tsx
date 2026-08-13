import { redirect } from 'next/navigation';
import Providers from '@/components/shared/Providers';
import { getSession } from '@/lib/auth/get-session';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'super_admin') redirect('/dashboard');
  return (
    <Providers>
      <AdminShell
        title="Operations"
        eyebrow="Super admin"
        actions={(
          <Link
            href="/admin/orgs"
            className="hidden min-h-11 min-w-11 items-center justify-center rounded-xl px-3 transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:inline-flex"
          >
            Administration
          </Link>
        )}
      >
        {children}
      </AdminShell>
    </Providers>
  );
}

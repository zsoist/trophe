import { redirect } from 'next/navigation';
import { getSession, roleAtLeast } from '@/lib/auth/get-session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!roleAtLeast(session.role, 'admin')) redirect('/dashboard');

  return <>{children}</>;
}

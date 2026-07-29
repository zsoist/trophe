import { redirect } from 'next/navigation';
import { signupDestination } from '@/lib/auth/signup-destination';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  redirect(signupDestination(code));
}

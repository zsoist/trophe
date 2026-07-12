import type { ReactNode } from 'react';
import Providers from '@/components/shared/Providers';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}

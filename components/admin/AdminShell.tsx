import type { ReactNode } from 'react';
import { AppHeader } from '@/components/shared/AppHeader';

export interface AdminShellProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
  backHref?: string;
}

export function AdminShell({
  title,
  eyebrow,
  children,
  actions,
  backHref = '/dashboard',
}: AdminShellProps) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--content-primary)]">
      <AppHeader
        title={title}
        eyebrow={eyebrow}
        backHref={backHref}
        actions={actions}
      />
      <div
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
      >
        {children}
      </div>
    </div>
  );
}

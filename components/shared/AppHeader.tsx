import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeModeToggle } from '@/components/shared/ThemeMode';

export interface AppHeaderProps {
  title: string;
  eyebrow?: string;
  backHref?: string;
  actions?: ReactNode;
}

export function AppHeader(_props: AppHeaderProps) {
  const { title, eyebrow, backHref, actions } = _props;

  return (
    <>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[calc(var(--z-nav,30)+1)] -translate-y-24 rounded-lg bg-[var(--action-primary)] px-4 py-3 text-sm font-semibold text-[var(--action-on-primary)] shadow-[var(--shadow-medium)] transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-[var(--z-nav,30)] border-b border-[var(--border-default)] bg-[var(--surface-overlay)]/95 pt-[env(safe-area-inset-top)] text-[var(--content-primary)] shadow-[var(--shadow-low)] backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-default)] text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--action-primary)]">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
          </div>
          {actions ? (
            <div className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-[var(--content-secondary)]">
              {actions}
            </div>
          ) : null}
          <ThemeModeToggle />
        </div>
      </header>
    </>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Bottom tab bar for client + coach apps.
 *
 * Renders 5 slots, gold-tinted active state. Active state determined by
 * Next's pathname → the parent screen doesn't manage active state itself,
 * which keeps the nav stable across server/client transitions.
 *
 * Active state uses color and opacity only, so it stays calm for people who
 * prefer reduced motion and never shifts the navigation target under a finger.
 */

export interface BotNavRoute {
  href: string;
  label: string;
  icon: ReactNode;
  /** Optional notification badge (number or "•"). */
  badge?: number | string;
}

interface BotNavProps {
  routes: BotNavRoute[];
  className?: string;
}

export function BotNav({ routes, className = '' }: BotNavProps) {
  const pathname = usePathname();
  return (
    <nav
      className={[
        'fixed bottom-0 left-0 right-0 z-[var(--z-nav,30)]',
        'flex justify-around items-center',
        'px-2 pt-1.5 safe-bottom sm:px-3.5',
        'bg-[var(--surface-overlay)]/95 text-[var(--content-secondary)] backdrop-blur',
        'border-t border-[var(--border-default)] shadow-[var(--shadow-medium)]',
        className,
      ].join(' ')}
      aria-label="Primary"
    >
      {routes.map((route) => {
        // Exact match OR prefix match — but only for routes with ≥2 real segments.
        // Without the depth guard, /dashboard/log would also activate the /dashboard (home)
        // tab because "/dashboard/log".startsWith("/dashboard") is true.
        const routeDepth = route.href.split('/').filter(Boolean).length;
        const active =
          pathname === route.href ||
          (routeDepth >= 2 && pathname?.startsWith(route.href + '/'));
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1',
              'text-[10px] uppercase tracking-[0.05em]',
              'transition-colors motion-reduce:transition-none',
              active
                ? 'bg-[var(--surface-active)] text-[var(--action-primary)]'
                : 'text-[var(--content-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-secondary)]',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0 h-0.5 w-9 rounded-full bg-[var(--action-primary)]',
                'transition-opacity motion-reduce:transition-none',
                active ? 'opacity-100' : 'opacity-0',
              ].join(' ')}
              aria-hidden="true"
            />
            <span
              className={[
                'text-[16px] leading-none transition-opacity motion-reduce:transition-none',
                active ? 'opacity-100' : 'opacity-75',
              ].join(' ')}
            >
              {route.icon}
            </span>
            <span className="font-medium">{route.label}</span>
            {route.badge !== undefined && (
              <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-danger-fg)] px-1 text-[10px] font-semibold text-[var(--content-inverse)]">
                {route.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

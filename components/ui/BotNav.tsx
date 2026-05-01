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
        'fixed bottom-0 left-0 right-0 z-30',
        'flex justify-around items-center',
        'px-3.5 pt-2.5 pb-4 safe-bottom',
        'bg-[rgba(10,10,10,0.95)] backdrop-blur',
        'border-t border-white/[0.06]',
        className,
      ].join(' ')}
      aria-label="Primary"
    >
      {routes.map((route) => {
        const active =
          pathname === route.href ||
          (route.href !== '/' && pathname?.startsWith(route.href));
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative flex flex-col items-center gap-0.5',
              'text-[8px] uppercase tracking-[0.05em]',
              active ? 'bnav-active' : 'bnav-dim',
            ].join(' ')}
          >
            <span className="text-[16px] leading-none">{route.icon}</span>
            <span className="font-medium">{route.label}</span>
            {route.badge !== undefined && (
              <span className="absolute -top-1 right-2 min-w-[14px] h-[14px] px-1 inline-flex items-center justify-center rounded-full bg-[var(--color-danger)] text-white text-[8px] font-semibold">
                {route.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

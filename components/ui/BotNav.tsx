'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Bottom tab bar for client + coach apps.
 *
 * Renders 5 slots, gold-tinted active state. Active state determined by
 * Next's pathname → the parent screen doesn't manage active state itself,
 * which keeps the nav stable across server/client transitions.
 *
 * The active tab carries a sliding gold indicator (framer `layoutId`) and
 * a subtle icon pop on change — both disabled under prefers-reduced-motion.
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
  const reducedMotion = useReducedMotion();
  return (
    <nav
      className={[
        'fixed bottom-0 left-0 right-0 z-[var(--z-nav,30)]',
        'flex justify-around items-center',
        'px-3.5 pt-2.5 pb-4 safe-bottom',
        'bg-[rgba(10,10,10,0.95)] backdrop-blur',
        'border-t border-white/[0.06]',
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
              'relative flex flex-col items-center gap-0.5 px-2',
              'text-[10px] uppercase tracking-[0.05em]',
              active ? 'bnav-active' : 'bnav-dim',
            ].join(' ')}
          >
            {/* Sliding gold active indicator */}
            {active && (
              <motion.span
                layoutId="bnav-active-indicator"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 400, damping: 32 }
                }
                className="absolute -top-[11px] h-[2px] w-9 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, var(--gold-300,#D4A853), transparent)',
                }}
                aria-hidden
              />
            )}
            <motion.span
              className="text-[16px] leading-none"
              initial={false}
              animate={
                active && !reducedMotion ? { scale: [1, 1.18, 1] } : { scale: 1 }
              }
              transition={{ duration: 0.3, type: 'tween', ease: 'easeOut' }}
            >
              {route.icon}
            </motion.span>
            <span className="font-medium">{route.label}</span>
            {route.badge !== undefined && (
              <span className="absolute -top-1 right-1 min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center rounded-full bg-[var(--color-danger)] text-white text-[10px] font-semibold">
                {route.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

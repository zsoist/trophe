'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Floating Action Button — gold-gradient circle anchored 14px from the right
 * edge, 74px above the bottom (clears the bot-nav). Used on Food Log (+ meal),
 * Coach Habits (+ habit), Coach Foods (+ custom food), etc.
 *
 * Position is the responsibility of the parent (relative-positioned screen
 * shell). The Fab itself only paints; a wrapper sets the `absolute` placement
 * to keep it composable inside scrollable lists, modals, etc.
 */

interface FabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Default 'plus' renders a "+" glyph; pass a Lucide icon as `icon` to override. */
  icon?: ReactNode;
  /** ARIA label — required (FABs have no visible text). */
  label: string;
}

export function Fab({
  icon,
  label,
  className = '',
  ...rest
}: FabProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        'w-10 h-10 rounded-full',
        'flex items-center justify-center',
        'text-[#0a0a0a] text-xl font-light leading-none',
        'fab-shadow',
        'transition-transform active:scale-95 hover:scale-105',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
      style={{
        background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
      }}
      {...rest}
    >
      {icon ?? '+'}
    </button>
  );
}

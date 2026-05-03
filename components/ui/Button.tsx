'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Button primitives. Two variants:
 *   - BtnGold: primary gold-gradient (canonical CTA)
 *   - BtnGhost: outlined neutral (secondary)
 *
 * Wraps the existing `.btn-gold` / `.btn-ghost` from globals.css. Phase 0.5
 * doesn't change the visual recipe — just adds the React surface so screens
 * compose typed components instead of stringifying class names.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children?: ReactNode;
};

const sizeClass = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-3.5 text-base',
};

export function BtnGold({
  size = 'md',
  fullWidth,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'btn-gold',
        sizeClass[size],
        fullWidth ? 'w-full' : '',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

export function BtnGhost({
  size = 'md',
  fullWidth,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'btn-ghost',
        sizeClass[size],
        fullWidth ? 'w-full' : '',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

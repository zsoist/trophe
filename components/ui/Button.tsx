'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children?: ReactNode;
};

export type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'size'> & {
  'aria-label': string;
};

const sizeClass = {
  sm: 'px-3 text-xs',
  md: 'px-4 text-sm',
  lg: 'px-6 text-base',
};

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--action-primary)] text-[var(--action-on-primary)] hover:bg-[var(--action-primary-hover)]',
  secondary: 'bg-[var(--action-secondary)] text-[var(--content-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border-default)]',
  ghost: 'bg-transparent text-[var(--content-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)] border border-[var(--border-default)]',
  danger: 'bg-[var(--status-danger-fg)] text-[var(--content-inverse)] hover:opacity-90',
};

const sharedButtonClass = [
  'inline-flex min-h-11 items-center justify-center rounded-xl font-semibold transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        sharedButtonClass,
        sizeClass[size],
        variantClass[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * An icon-only control. The accessible name is intentionally required so an
 * icon never becomes an unlabeled touch target for assistive technology.
 */
export function IconButton({ variant = 'ghost', className = '', children, ...rest }: IconButtonProps) {
  return (
    <button
      className={[
        sharedButtonClass,
        'min-w-11 px-0',
        variantClass[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Backward-compatible named variants for incremental route migration. */
export function BtnGold(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="primary" {...props} />;
}

export function BtnGhost(props: Omit<ButtonProps, 'variant'>) {
  return <Button variant="ghost" {...props} />;
}

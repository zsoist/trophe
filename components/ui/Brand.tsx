import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Mono chrome typography primitives.
 *
 * The v0.3 design uses JetBrains Mono for ALL chrome (eyebrows, labels,
 * route paths, section headings, brand wordmarks). Sans (Inter) stays for
 * body copy and titles. These primitives wrap the canonical `.brand-eye`,
 * `.mono-label`, and `.section-title` utility classes from globals.css.
 */

interface BrandEyeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

/** Gold mono eyebrow — uppercase, 8px, .2em letter-spacing. */
export function BrandEye({ className = '', children, ...rest }: BrandEyeProps) {
  return (
    <span className={`brand-eye ${className}`} {...rest}>
      {children}
    </span>
  );
}

/** Muted mono label — uppercase, 9px, .18em letter-spacing. */
export function MonoLabel({ className = '', children, ...rest }: BrandEyeProps) {
  return (
    <span className={`mono-label ${className}`} {...rest}>
      {children}
    </span>
  );
}

/** Gold mono section heading with bottom border. */
export function SectionTitle({
  className = '',
  children,
  ...rest
}: BrandEyeProps) {
  return (
    <h3
      className={`section-title border-b border-[rgba(212,168,83,0.15)] pb-2 mb-5 ${className}`}
      {...rest}
    >
      {children}
    </h3>
  );
}

/** The Greek wordmark τροφή as a styled brand element. */
export function Wordmark({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-xs tracking-[0.18em]',
    md: 'text-sm tracking-[0.18em]',
    lg: 'text-2xl tracking-[0.05em]',
  };
  return (
    <span
      className={`font-mono font-bold text-[var(--color-gold)] ${sizes[size]} ${className}`}
      aria-label="Trophē"
    >
      τροφή
    </span>
  );
}

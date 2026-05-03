import type { HTMLAttributes } from 'react';

/**
 * Gold-gradient circle with initials. Two sizes:
 *   - sm (24px): inline next to coach notes, message rows, lists
 *   - lg (32px): client detail headers, profile cards
 *
 * Phase 4+ may extend with a `src` prop for real avatar images; for v0.3
 * intro the initials avatar is the canonical look (matches Handoff `.av`/`.av-lg`).
 */

interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Display name; first letters of first + last word are used. */
  name: string;
  size?: 'sm' | 'lg';
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

const sizeClass = {
  sm: 'w-6 h-6 text-[10px]',
  lg: 'w-8 h-8 text-[13px]',
};

export function Avatar({
  name,
  size = 'sm',
  className = '',
  ...rest
}: AvatarProps) {
  return (
    <span
      aria-label={name}
      title={name}
      className={[
        'inline-flex items-center justify-center rounded-full flex-shrink-0',
        'font-bold text-[#000]',
        sizeClass[size],
        className,
      ].join(' ')}
      style={{
        background: 'linear-gradient(135deg, var(--color-gold), var(--color-gold-dark))',
      }}
      {...rest}
    >
      {initialsOf(name)}
    </span>
  );
}

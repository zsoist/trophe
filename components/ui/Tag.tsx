import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Status pill primitive — small uppercase capsule used for short labels
 * like "14-day cycle", "missed", "in progress", "v0.3", "free tier".
 *
 * Maps directly to globals.css `.tag-g/r/y/gn` so the canonical color
 * recipe (10% bg + 30% border + full saturation text) lives in one place.
 */

type TagVariant = 'gold' | 'danger' | 'warning' | 'success' | 'neutral';

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
  children?: ReactNode;
}

const variantClass: Record<TagVariant, string> = {
  gold: 'tag tag-g',
  danger: 'tag tag-r',
  warning: 'tag tag-y',
  success: 'tag tag-gn',
  neutral:
    'tag border-white/10 bg-white/[0.04] text-[var(--text-secondary)]',
};

export function Tag({
  variant = 'gold',
  className = '',
  children,
  ...rest
}: TagProps) {
  return (
    <span className={`${variantClass[variant]} ${className}`} {...rest}>
      {children}
    </span>
  );
}

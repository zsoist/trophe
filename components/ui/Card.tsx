import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Surface primitives — neutral, gold-bordered, danger-bordered.
 *
 * Built on `.glass` from globals.css for backdrop-blur + light-mode safety.
 * 12px radius (vs `.glass-elevated`'s 20px) matches the Handoff's `.card` spec.
 */

type CardVariant = 'neutral' | 'gold' | 'danger';

interface CardBaseProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children?: ReactNode;
}

const variantClass: Record<CardVariant, string> = {
  neutral: 'border-white/[0.06]',
  gold: 'border-[rgba(212,168,83,0.25)]',
  danger: 'border-[rgba(239,68,68,0.20)]',
};

export function Card({
  variant = 'neutral',
  className = '',
  children,
  ...rest
}: CardBaseProps) {
  return (
    <div
      className={[
        'rounded-xl border',
        'bg-[rgba(26,26,26,0.75)]',
        variantClass[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

// Convenience wrappers for the two emphasis variants — saves a prop everywhere
// they're used in screen redesigns.
export function CardGold(props: Omit<CardBaseProps, 'variant'>) {
  return <Card variant="gold" {...props} />;
}

export function CardDanger(props: Omit<CardBaseProps, 'variant'>) {
  return <Card variant="danger" {...props} />;
}

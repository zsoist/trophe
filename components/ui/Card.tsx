import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'neutral' | 'gold' | 'danger';

export interface CardBaseProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children?: ReactNode;
}

const variantClass: Record<CardVariant, string> = {
  neutral: 'border-[var(--border-subtle)]',
  gold: 'border-[var(--border-focus)]',
  danger: 'border-[var(--status-danger-border)]',
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
        'rounded-xl border bg-[var(--surface-1)] text-[var(--content-primary)] shadow-[var(--shadow-low)]',
        variantClass[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardGold(props: Omit<CardBaseProps, 'variant'>) {
  return <Card variant="gold" {...props} />;
}

export function CardDanger(props: Omit<CardBaseProps, 'variant'>) {
  return <Card variant="danger" {...props} />;
}

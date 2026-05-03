import type { HTMLAttributes } from 'react';

/**
 * 6×6 colored dot used inline next to labels (compliance status, server
 * health, badge readiness). For 10×10 status indicators with glow use the
 * existing globals.css `.status-dot` utility instead.
 */

type Status = 'on' | 'warn' | 'off' | 'idle';

const colorClass: Record<Status, string> = {
  on: 'bg-[var(--color-success)]',
  warn: 'bg-[var(--color-warning)]',
  off: 'bg-[var(--color-danger)]',
  idle: 'bg-[var(--text-dim,#57534e)]',
};

interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  status?: Status;
  size?: number;
}

export function StatusDot({
  status = 'on',
  size = 6,
  className = '',
  ...rest
}: StatusDotProps) {
  return (
    <span
      role="status"
      aria-label={status}
      className={`inline-block rounded-full ${colorClass[status]} ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    />
  );
}

import type { ReactNode } from 'react';

interface ResultRowProps {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  metric?: ReactNode;
  action?: ReactNode;
  state?: 'default' | 'active' | 'complete' | 'warning';
  className?: string;
}

export function ResultRow({
  leading,
  title,
  meta,
  metric,
  action,
  state = 'default',
  className = '',
}: ResultRowProps) {
  return (
    <div className={`performance-result-row performance-result-row--${state} ${className}`}>
      {leading ? <div className="performance-result-row__leading">{leading}</div> : null}
      <div className="performance-result-row__content">
        <div className="performance-result-row__title">{title}</div>
        {meta ? <div className="performance-result-row__meta">{meta}</div> : null}
      </div>
      {metric ? <div className="performance-result-row__metric">{metric}</div> : null}
      {action ? <div className="performance-result-row__action">{action}</div> : null}
    </div>
  );
}

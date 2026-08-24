import { useId, type ReactNode } from 'react';

interface PerformanceSectionProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PerformanceSection({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: PerformanceSectionProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={`performance-section ${className}`}>
      <div className="performance-section__heading">
        <div className="min-w-0">
          {eyebrow ? <p className="performance-eyebrow">{eyebrow}</p> : null}
          <h2 id={headingId} className="performance-section__title">{title}</h2>
        </div>
        {action ? <div className="performance-section__action">{action}</div> : null}
      </div>
      <div className="performance-section__body">{children}</div>
    </section>
  );
}

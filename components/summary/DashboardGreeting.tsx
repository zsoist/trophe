import { Icon } from '@/components/ui';
import { getEnglishGreeting } from '@/lib/product-language';

interface DashboardGreetingProps {
  firstName: string | null;
  role: string | null;
  hour: number;
  date: Date;
  streakDays: number;
}

export default function DashboardGreeting({
  firstName,
  role,
  hour,
  date,
  streakDays,
}: DashboardGreetingProps) {
  const greeting = getEnglishGreeting(hour);
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="row-b mb-3">
      <div className="row-i" style={{ gap: 10, minWidth: 0 }}>
        <div className="av-lg" aria-hidden="true">
          {firstName?.[0]?.toUpperCase() ?? 'N'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: 'var(--content-primary)',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-.01em',
              lineHeight: 1.35,
            }}
          >
            {greeting}{firstName ? `, ${firstName}` : ''},
          </div>
          <div className="ds-sub">{dateLabel}</div>
        </div>
      </div>

      <div className="row-i" style={{ gap: 8, flexShrink: 0 }}>
        {role === 'super_admin' && (
          <a
            href="/super"
            aria-label="Super command center"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full px-3 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Super
          </a>
        )}
        {role === 'coach' && (
          <a
            href="/coach"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full px-3 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-default)',
              color: 'var(--content-secondary)',
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            Coach view
          </a>
        )}
        {streakDays > 0 && (
          <span className="tag tag-g">
            <Icon name="i-flame" size={9} />
            {streakDays}d
          </span>
        )}
      </div>
    </div>
  );
}

import { Icon } from '@/components/ui';
import type { DailyNutritionNote } from '@/lib/nutrition/daily-summary';

const TONE_COLOR: Record<DailyNutritionNote['tone'], string> = {
  neutral: 'var(--content-secondary)',
  info: 'var(--status-info-fg)',
  positive: 'var(--status-success-fg)',
  attention: 'var(--status-warning-fg)',
};

export default function TodayNutritionNote({ note }: { note: DailyNutritionNote }) {
  return (
    <section
      className="card mb-3"
      aria-labelledby="today-nutrition-note-title"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-default)',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Icon name={note.icon} size={15} style={{ color: TONE_COLOR[note.tone], flexShrink: 0, marginTop: 1 }} />
        <div>
          <h2
            id="today-nutrition-note-title"
            style={{ color: 'var(--content-primary)', fontSize: 12, fontWeight: 700, marginBottom: 3 }}
          >
            Today&apos;s note
          </h2>
          <p style={{ color: 'var(--content-secondary)', fontSize: 12, lineHeight: 1.5 }}>
            {note.text}
          </p>
        </div>
      </div>
    </section>
  );
}

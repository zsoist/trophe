interface DailyMacroStripProps {
  protein: number;
  carbs: number;
  fat: number;
  sugar: number | null;
  sugarCompleteness?: 'complete' | 'partial' | 'unknown' | 'unavailable';
  label?: string;
}

const METRICS = [
  { key: 'protein', label: 'Protein', tone: 'coral' },
  { key: 'carbs', label: 'Carbs', tone: 'cyan' },
  { key: 'fat', label: 'Fat', tone: 'violet' },
] as const;

export default function DailyMacroStrip({
  protein,
  carbs,
  fat,
  sugar,
  sugarCompleteness = sugar === null ? 'unavailable' : 'complete',
  label = "Today's nutrition",
}: DailyMacroStripProps) {
  const values = { protein, carbs, fat };

  return (
    <div className="daily-macro-strip" role="group" aria-label={label}>
      {METRICS.map((metric) => (
        <div key={metric.key} className="daily-macro-strip__cell" data-macro={metric.key}>
          <span className="daily-macro-strip__label">{metric.label}</span>
          <strong className={`daily-macro-strip__value daily-macro-strip__value--${metric.tone}`}>
            {Math.round(values[metric.key])}g
          </strong>
        </div>
      ))}
      <div className="daily-macro-strip__cell" data-macro="sugar">
        <span className="daily-macro-strip__label">Sugar</span>
        <strong className={`daily-macro-strip__value daily-macro-strip__value--orange${sugar === null ? ' daily-macro-strip__value--unavailable' : ''}`}>
          {sugar === null ? 'Not available' : `${Math.round(sugar)}g`}
        </strong>
        {sugarCompleteness === 'partial' ? (
          <span className="daily-macro-strip__status">Incomplete</span>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import type { FoodLogEntry, MealType } from '@/lib/types';

interface MealTimelineProps {
  foodLog: FoodLogEntry[];
}

const MEAL_COLORS: Record<string, string> = {
  breakfast: '#f59e0b',
  lunch: '#22c55e',
  dinner: '#3b82f6',
  snack: '#78716c',
  pre_workout: '#a855f7',
  post_workout: '#ec4899',
};

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  pre_workout: 'Pre-WO',
  post_workout: 'Post-WO',
};

export default function MealTimeline({ foodLog }: MealTimelineProps) {
  if (foodLog.length === 0) return null;

  // Group by meal_type and compute total calories per meal event
  const mealEvents: {
    hour: number;
    mealType: string;
    calories: number;
    label: string;
  }[] = [];

  // Group entries by meal_type to create aggregated events
  const grouped: Record<string, FoodLogEntry[]> = {};
  for (const entry of foodLog) {
    const key = entry.meal_type || 'snack';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  for (const [mealType, entries] of Object.entries(grouped)) {
    // Get the average time from created_at timestamps
    const times = entries
      .map((e) => new Date(e.created_at))
      .filter((d) => !isNaN(d.getTime()));

    if (times.length === 0) continue;

    const avgTime = new Date(
      times.reduce((sum, d) => sum + d.getTime(), 0) / times.length
    );
    const hour = avgTime.getHours() + avgTime.getMinutes() / 60;

    const totalCal = entries.reduce((s, e) => s + (e.calories ?? 0), 0);

    mealEvents.push({
      hour,
      mealType,
      calories: totalCal,
      label: MEAL_LABELS[mealType] || mealType,
    });
  }

  // Sort by hour
  mealEvents.sort((a, b) => a.hour - b.hour);

  // Timeline range: 6am to 10pm (6-22)
  const startHour = 6;
  const endHour = 22;
  const range = endHour - startHour;

  // Max calories for scaling dot size
  const maxCal = Math.max(...mealEvents.map((e) => e.calories), 100);

  // Time markers
  const markers = [6, 9, 12, 15, 18, 21];

  return (
    <div className="glass p-4 mb-4">
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Meal Timeline
      </h3>

      <div className="relative">
        {/* Timeline bar */}
        <div className="h-1 bg-white/[0.06] rounded-full relative mx-2">
          {/* Time markers */}
          {markers.map((h) => {
            const pct = ((h - startHour) / range) * 100;
            return (
              <div
                key={h}
                className="absolute top-full mt-1.5"
                style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-px h-1.5 bg-white/10 mx-auto mb-0.5" />
                <span className="text-[9px] text-stone-600">
                  {h > 12 ? `${h - 12}p` : h === 12 ? '12p' : `${h}a`}
                </span>
              </div>
            );
          })}

          {/* Meal dots */}
          {mealEvents.map((event, i) => {
            const pct = Math.max(
              0,
              Math.min(100, ((event.hour - startHour) / range) * 100)
            );
            // Dot size: min 12px, max 28px based on calories
            const dotSize = 12 + (event.calories / maxCal) * 16;
            const color = MEAL_COLORS[event.mealType] || '#78716c';

            return (
              <motion.div
                key={`${event.mealType}-${i}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.1, type: 'spring', stiffness: 300 }}
                className="absolute top-1/2 -translate-y-1/2 group cursor-default"
                style={{
                  left: `${pct}%`,
                  transform: `translateX(-50%) translateY(-50%)`,
                }}
              >
                {/* Dot */}
                <div
                  className="rounded-full border-2 border-stone-950 relative"
                  style={{
                    width: dotSize,
                    height: dotSize,
                    backgroundColor: color,
                    boxShadow: `0 0 8px ${color}40`,
                  }}
                />
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="glass-elevated px-2 py-1.5 rounded-lg whitespace-nowrap text-center">
                    <div className="text-[10px] font-medium text-stone-200">
                      {event.label}
                    </div>
                    <div className="text-[9px] text-stone-400">
                      {Math.round(event.calories)} kcal
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom spacing for markers */}
        <div className="h-6" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1">
        {mealEvents.map((event) => (
          <div key={event.mealType} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: MEAL_COLORS[event.mealType] || '#78716c' }}
            />
            <span className="text-[10px] text-stone-500">
              {event.label} ({Math.round(event.calories)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

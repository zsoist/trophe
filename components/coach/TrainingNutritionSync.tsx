'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

interface DayData {
  date: string;
  trained: boolean;
  carbsLogged: number;
  carbTarget: number;
}

interface TrainingNutritionSyncProps {
  days: DayData[];
}

function isSynced(day: DayData): boolean {
  if (!day.trained) return true; // Rest day = no mismatch
  return day.carbTarget > 0 && day.carbsLogged >= day.carbTarget * 0.8;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default memo(function TrainingNutritionSync({ days }: TrainingNutritionSyncProps) {
  const syncedCount = days.filter((d) => d.trained && isSynced(d)).length;
  const trainedCount = days.filter((d) => d.trained).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-200 text-sm font-semibold">Training &times; Nutrition</h3>
        {trainedCount > 0 && (
          <span className="text-stone-500 text-[10px]">
            {syncedCount}/{trainedCount} synced
          </span>
        )}
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {/* Day labels */}
        {days.slice(0, 7).map((day) => (
          <div key={`label-${day.date}`} className="text-center">
            <span className="text-stone-600 text-[9px] font-medium">
              {getDayLabel(day.date)}
            </span>
          </div>
        ))}

        {/* Status cells */}
        {days.slice(0, 7).map((day, idx) => {
          const trained = day.trained;
          const synced = isSynced(day);
          const carbPct =
            day.carbTarget > 0
              ? Math.min(Math.round((day.carbsLogged / day.carbTarget) * 100), 150)
              : 0;

          return (
            <motion.div
              key={day.date}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05, duration: 0.2 }}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 border ${
                !trained
                  ? 'bg-white/[0.02] border-white/[0.04]'
                  : synced
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              {trained ? (
                <>
                  {synced ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <X size={12} className="text-red-400" />
                  )}
                  <span
                    className={`text-[8px] font-medium ${
                      synced ? 'text-emerald-400/70' : 'text-red-400/70'
                    }`}
                  >
                    {carbPct}%
                  </span>
                </>
              ) : (
                <span className="text-stone-700 text-[8px]">Rest</span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-1">
          <Check size={10} className="text-emerald-400" />
          <span className="text-stone-600 text-[9px]">Synced</span>
        </div>
        <div className="flex items-center gap-1">
          <X size={10} className="text-red-400" />
          <span className="text-stone-600 text-[9px]">Mismatch</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded bg-white/[0.04]" />
          <span className="text-stone-600 text-[9px]">Rest</span>
        </div>
      </div>
    </motion.div>
  );
});

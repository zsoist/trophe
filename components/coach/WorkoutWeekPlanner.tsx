'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, X, ChevronDown, Moon } from 'lucide-react';

interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseCount: number;
}

interface DaySlot {
  day: string;
  template: { name: string; exerciseCount: number } | null;
}

interface WorkoutWeekPlannerProps {
  days: DaySlot[];
  templates: WorkoutTemplate[];
  onAssign: (day: string, templateId: string | null) => void;
}

const DAY_ABBR: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

export default memo(function WorkoutWeekPlanner({
  days,
  templates,
  onAssign,
}: WorkoutWeekPlannerProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = useCallback((day: string) => {
    setOpenDropdown((prev) => (prev === day ? null : day));
  }, []);

  const handleAssign = useCallback(
    (day: string, templateId: string | null) => {
      onAssign(day, templateId);
      setOpenDropdown(null);
    },
    [onAssign],
  );

  const activeDays = days.filter((d) => d.template !== null).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
          <Dumbbell size={14} className="text-[var(--action-primary)]" />
          Week Planner
        </h3>
        <span className="text-[var(--content-muted)] text-xs">{activeDays}/7 training days</span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((slot, i) => {
          const isOpen = openDropdown === slot.day;
          const abbr = DAY_ABBR[slot.day] ?? slot.day.slice(0, 3);

          return (
            <div key={slot.day} className="relative">
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                onClick={() => toggleDropdown(slot.day)}
                className={`min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full rounded-xl p-2 transition-colors border text-center ${
                  slot.template
                    ? 'bg-[var(--action-primary)]/10 border-[var(--action-primary)]/20 hover:bg-[var(--action-primary)]/15'
                    : 'bg-[var(--surface-hover)] border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <p
                  className={`text-xs font-semibold mb-1 ${
                    slot.template ? 'text-[var(--action-primary)]' : 'text-[var(--content-muted)]'
                  }`}
                >
                  {abbr}
                </p>

                {slot.template ? (
                  <>
                    <Dumbbell
                      size={16}
                      className="mx-auto mb-1"
                      style={{ color: 'var(--action-primary)' }}
                    />
                    <p className="text-[var(--content-secondary)] text-xs leading-tight truncate">
                      {slot.template.name}
                    </p>
                    <p className="text-[var(--content-muted)] text-xs">
                      {slot.template.exerciseCount} ex
                    </p>
                  </>
                ) : (
                  <>
                    <Moon size={16} className="mx-auto mb-1 text-[var(--content-muted)]" />
                    <p className="text-[var(--content-muted)] text-xs">Rest</p>
                  </>
                )}

                <ChevronDown size={10} className="mx-auto mt-1 text-[var(--content-muted)]" />
              </motion.button>

              {/* Dropdown */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-30 top-full mt-1 left-1/2 -translate-x-1/2 w-40 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden"
                  >
                    {/* Rest day option */}
                    <button
                      type="button"
                      onClick={() => handleAssign(slot.day, null)}
                      className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors text-left"
                    >
                      <Moon size={12} className="text-[var(--content-muted)]" />
                      <span className="text-[var(--content-secondary)] text-xs">Rest Day</span>
                      {!slot.template && (
                        <X size={10} className="ml-auto text-[var(--content-muted)]" />
                      )}
                    </button>

                    <div className="border-t border-[var(--border-subtle)]" />

                    {/* Templates */}
                    <div className="max-h-[120px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleAssign(slot.day, tpl.id)}
                          className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors text-left"
                        >
                          <Dumbbell size={12} className="text-[var(--action-primary)] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[var(--content-secondary)] text-xs truncate">{tpl.name}</p>
                            <p className="text-[var(--content-muted)] text-xs">{tpl.exerciseCount} exercises</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
});

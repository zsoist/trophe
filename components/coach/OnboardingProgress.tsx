'use client';

import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════
// τροφή — Onboarding Progress Stepper (Wave 4)
// Visual stepper with gold connecting lines
// ═══════════════════════════════════════════════

interface OnboardingStep {
  label: string;
  completed: boolean;
  emoji: string;
}

interface OnboardingProgressProps {
  steps: OnboardingStep[];
}

export default function OnboardingProgress({ steps }: OnboardingProgressProps) {
  const activeIndex = steps.findIndex((s) => !s.completed);
  const allComplete = activeIndex === -1;

  return (
    <div className="w-full">
      {/* Label: completion status */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-stone-200">Onboarding</h4>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            background: allComplete ? 'rgba(34,197,94,0.12)' : 'rgba(212,168,83,0.1)',
            color: allComplete ? '#22c55e' : '#D4A853',
            border: `1px solid ${allComplete ? 'rgba(34,197,94,0.2)' : 'rgba(212,168,83,0.15)'}`,
          }}
        >
          {allComplete ? 'Complete' : `${steps.filter((s) => s.completed).length}/${steps.length}`}
        </span>
      </div>

      {/* Stepper */}
      <div className="relative flex items-start justify-between">
        {/* Connecting line (background) */}
        <div
          className="absolute top-4 left-4 right-4 h-[2px]"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        />

        {/* Animated progress line */}
        <motion.div
          className="absolute top-4 left-4 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, #D4A853, rgba(212,168,83,0.6))',
            originX: 0,
          }}
          initial={{ width: 0 }}
          animate={{
            width: allComplete
              ? 'calc(100% - 32px)'
              : `calc(${((activeIndex > 0 ? activeIndex : 0) / (steps.length - 1)) * 100}% - 0px)`,
          }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />

        {steps.map((step, i) => {
          const isComplete = step.completed;
          const isActive = i === activeIndex;
          const isUpcoming = !isComplete && !isActive;

          return (
            <motion.div
              key={i}
              className="relative flex flex-col items-center z-10"
              style={{ flex: '1 1 0', maxWidth: `${100 / steps.length}%` }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
            >
              {/* Circle */}
              <motion.div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm mb-2 relative"
                style={{
                  background: isComplete
                    ? 'rgba(212,168,83,0.2)'
                    : isActive
                    ? 'rgba(212,168,83,0.1)'
                    : 'rgba(255,255,255,0.04)',
                  border: isComplete
                    ? '2px solid #D4A853'
                    : isActive
                    ? '2px solid rgba(212,168,83,0.5)'
                    : '2px solid rgba(255,255,255,0.08)',
                }}
                animate={
                  isActive
                    ? {
                        boxShadow: [
                          '0 0 0 0 rgba(212,168,83,0)',
                          '0 0 0 6px rgba(212,168,83,0.15)',
                          '0 0 0 0 rgba(212,168,83,0)',
                        ],
                      }
                    : {}
                }
                transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
              >
                {isComplete ? (
                  <motion.svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.3 + i * 0.1, type: 'spring', stiffness: 300 }}
                  >
                    <path
                      d="M3 7L6 10L11 4"
                      stroke="#D4A853"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                ) : (
                  <span
                    className="text-xs"
                    style={{
                      opacity: isUpcoming ? 0.3 : 1,
                      filter: isUpcoming ? 'grayscale(1)' : 'none',
                    }}
                  >
                    {step.emoji}
                  </span>
                )}
              </motion.div>

              {/* Label */}
              <span
                className="text-[10px] text-center leading-tight font-medium px-1"
                style={{
                  color: isComplete
                    ? '#D4A853'
                    : isActive
                    ? 'rgba(231,229,228,0.9)'
                    : 'rgba(168,162,158,0.4)',
                }}
              >
                {step.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { memo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Zap, FlaskConical, Rocket, X } from 'lucide-react';

interface CoachOnboardingWizardProps {
  coachName: string;
  hasClients: boolean;
  hasProtocols: boolean;
  hasTemplates: boolean;
  onDismiss: () => void;
}

const STORAGE_KEY = 'trophe_coach_onboarding_dismissed';

interface Step {
  key: string;
  icon: typeof UserPlus;
  color: string;
  bg: string;
  title: string;
  description: string;
  completed: boolean;
}

export default memo(function CoachOnboardingWizard({
  coachName,
  hasClients,
  hasProtocols,
  hasTemplates,
  onDismiss,
}: CoachOnboardingWizardProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden until we check
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // localStorage not available
    }
    setDismissed(true);
    onDismiss();
  }, [onDismiss]);

  const steps: Step[] = [
    {
      key: 'welcome',
      icon: Rocket,
      color: '#D4A853',
      bg: 'rgba(212, 168, 83, 0.15)',
      title: `Welcome, ${coachName}! \uD83D\uDC4B`,
      description:
        "Let's get your coaching workspace set up. Follow these steps to start managing clients like a pro.",
      completed: true,
    },
    {
      key: 'clients',
      icon: UserPlus,
      color: '#60a5fa',
      bg: 'rgba(96, 165, 250, 0.15)',
      title: 'Add your first client',
      description:
        'Invite a client to start tracking their nutrition. You\'ll be able to monitor their progress, set macros, and assign habits.',
      completed: hasClients,
    },
    {
      key: 'habits',
      icon: Zap,
      color: '#4ade80',
      bg: 'rgba(74, 222, 128, 0.15)',
      title: 'Create a habit',
      description:
        'Habits drive behavior change. Create your first habit template \u2014 like "Log meals daily" or "Drink 2L water" \u2014 and assign it to a client.',
      completed: hasTemplates,
    },
    {
      key: 'protocols',
      icon: FlaskConical,
      color: '#a78bfa',
      bg: 'rgba(167, 139, 250, 0.15)',
      title: 'Set up a protocol',
      description:
        'Protocols bundle supplements and dosages together. Use a built-in template or create your own custom stack.',
      completed: hasProtocols,
    },
    {
      key: 'ready',
      icon: Rocket,
      color: '#D4A853',
      bg: 'rgba(212, 168, 83, 0.15)',
      title: "You're ready!",
      description:
        'Your coaching workspace is set up. Monitor clients, track adherence, and guide them to their goals.',
      completed: hasClients && hasProtocols && hasTemplates,
    },
  ];

  const canGoNext = currentStep < steps.length - 1;
  const canGoPrev = currentStep > 0;
  const isLast = currentStep === steps.length - 1;

  if (dismissed) return null;

  const step = steps[currentStep];
  const StepIcon = step.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 relative overflow-hidden"
    >
      {/* Subtle gradient accent */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
        style={{
          background: 'linear-gradient(90deg, #D4A853, #60a5fa, #4ade80, #a78bfa)',
        }}
      />

      {/* Skip button */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-stone-600 hover:text-stone-400 transition-colors p-1"
        title="Skip onboarding"
      >
        <X size={14} />
      </button>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setCurrentStep(i)}
            className="transition-all"
          >
            <div
              className={`rounded-full transition-all ${
                i === currentStep
                  ? 'w-6 h-1.5'
                  : 'w-1.5 h-1.5'
              }`}
              style={{
                backgroundColor:
                  i === currentStep
                    ? '#D4A853'
                    : s.completed
                      ? 'rgba(212, 168, 83, 0.4)'
                      : 'rgba(255,255,255,0.1)',
              }}
            />
          </button>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.key}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="text-center"
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: step.bg }}
          >
            <StepIcon size={24} style={{ color: step.color }} />
          </div>

          <h3 className="text-stone-100 text-sm font-semibold mb-1.5">{step.title}</h3>
          <p className="text-stone-400 text-xs leading-relaxed max-w-xs mx-auto">
            {step.description}
          </p>

          {/* Completion badge */}
          {step.completed && currentStep > 0 && currentStep < steps.length - 1 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.15)',
                color: '#4ade80',
              }}
            >
              Done
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => setCurrentStep((s) => s - 1)}
          disabled={!canGoPrev}
          className="text-stone-500 hover:text-stone-300 text-xs transition-colors disabled:opacity-0 disabled:cursor-default"
        >
          Back
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleDismiss}
            className="py-1.5 px-4 rounded-lg font-semibold text-sm transition-all"
            style={{
              backgroundColor: 'rgba(212, 168, 83, 0.15)',
              color: '#D4A853',
              borderWidth: 1,
              borderColor: 'rgba(212, 168, 83, 0.3)',
            }}
          >
            Get Started
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s + 1)}
            disabled={!canGoNext}
            className="text-[#D4A853] hover:text-[#e0b964] text-xs font-semibold transition-colors disabled:opacity-30"
          >
            Next
          </button>
        )}
      </div>
    </motion.div>
  );
});

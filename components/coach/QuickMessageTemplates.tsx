'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Send, Heart, Compass, TrendingUp, AlertCircle } from 'lucide-react';

interface QuickMessageTemplatesProps {
  onSend: (message: string, type: string) => void;
}

interface Template {
  message: string;
  emoji: string;
}

interface Category {
  key: string;
  label: string;
  icon: typeof Heart;
  color: string;
  bg: string;
  templates: Template[];
}

const CATEGORIES: Category[] = [
  {
    key: 'encouragement',
    label: 'Encouragement',
    icon: Heart,
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.15)',
    templates: [
      { message: 'Great consistency this week! \uD83C\uDFAF', emoji: '\uD83C\uDFAF' },
      { message: 'Your protein intake is improving, keep it up! \uD83D\uDCAA', emoji: '\uD83D\uDCAA' },
      { message: 'Love seeing those daily check-ins! \uD83D\uDD25', emoji: '\uD83D\uDD25' },
    ],
  },
  {
    key: 'guidance',
    label: 'Guidance',
    icon: Compass,
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.15)',
    templates: [
      { message: "Let's focus on hitting your protein target this week", emoji: '\uD83C\uDFAF' },
      { message: 'Try adding a veggie to each meal for fiber', emoji: '\uD83E\uDD66' },
      { message: 'Remember to log before bed \u2014 even a quick entry helps', emoji: '\uD83D\uDCDD' },
    ],
  },
  {
    key: 'progression',
    label: 'Progression',
    icon: TrendingUp,
    color: '#4ade80',
    bg: 'rgba(74, 222, 128, 0.15)',
    templates: [
      { message: "You've mastered this habit \u2014 time for the next challenge! \uD83C\uDF93", emoji: '\uD83C\uDF93' },
      { message: 'Ready to increase your training volume?', emoji: '\uD83D\uDCAA' },
      { message: "Your adherence is strong \u2014 let's adjust your macros", emoji: '\uD83D\uDCC8' },
    ],
  },
  {
    key: 'concern',
    label: 'Concern',
    icon: AlertCircle,
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.15)',
    templates: [
      { message: 'I noticed you missed a few days \u2014 everything okay?', emoji: '\uD83D\uDC9B' },
      { message: "Your weekend intake dropped significantly \u2014 let's discuss", emoji: '\uD83D\uDCC9' },
      { message: "Seems like you're struggling with this habit \u2014 want to adjust?", emoji: '\uD83E\uDD1D' },
    ],
  },
];

export default memo(function QuickMessageTemplates({ onSend }: QuickMessageTemplatesProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggleCategory = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const handleSend = useCallback(
    (message: string, type: string) => {
      onSend(message, type);
    },
    [onSend],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
        Quick Messages
      </h3>

      <div className="space-y-1.5">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isOpen = expandedKey === cat.key;
          return (
            <div key={cat.key}>
              <button
                type="button"
                onClick={() => toggleCategory(cat.key)}
                className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: cat.bg }}
                >
                  <Icon size={14} style={{ color: cat.color }} />
                </div>
                <span className="text-stone-200 text-sm font-medium flex-1 text-left">
                  {cat.label}
                </span>
                <span className="text-stone-500 text-[10px] mr-1">{cat.templates.length}</span>
                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} className="text-stone-500" />
                </motion.div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pl-4 pr-1 pb-1 space-y-1">
                      {cat.templates.map((tpl, idx) => (
                        <motion.button
                          key={idx}
                          type="button"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05, duration: 0.2 }}
                          onClick={() => handleSend(tpl.message, cat.key)}
                          className="w-full flex items-center gap-2 py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] transition-colors group text-left"
                        >
                          <span className="text-sm flex-shrink-0">{tpl.emoji}</span>
                          <span className="text-stone-400 text-xs flex-1 leading-relaxed">
                            {tpl.message}
                          </span>
                          <Send
                            size={12}
                            className="text-stone-600 group-hover:text-[#D4A853] transition-colors flex-shrink-0"
                          />
                        </motion.button>
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

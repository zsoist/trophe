'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';

interface DashboardGreetingProps {
  coachName: string;
  needsAttention: number;
}

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '\uD83C\uDF05' };
  if (hour < 18) return { text: 'Good afternoon', emoji: '\u2600\uFE0F' };
  return { text: 'Good evening', emoji: '\uD83C\uDF19' };
}

export default memo(function DashboardGreeting({ coachName, needsAttention }: DashboardGreetingProps) {
  const greeting = useMemo(getGreeting, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="mb-6"
    >
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.6 }}
        className="text-stone-100 text-xl sm:text-2xl font-bold"
      >
        {greeting.text}, {coachName} {greeting.emoji}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="text-stone-400 text-sm mt-1"
      >
        {needsAttention > 0 ? (
          <>
            <span className="text-[#D4A853] font-semibold">{needsAttention}</span>
            {' '}client{needsAttention !== 1 ? 's' : ''} need{needsAttention === 1 ? 's' : ''} attention today
          </>
        ) : (
          <span>
            All clients on track! {'\uD83C\uDFAF'}
          </span>
        )}
      </motion.p>
    </motion.div>
  );
});

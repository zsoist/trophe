'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface DashboardGreetingProps {
  coachName: string;
  needsAttention: number;
}

// No emoji \u2014 icons are sprite/Lucide only (design rule); the greeting stands alone.
// Time-of-day is applied AFTER mount: the static prerender bakes the build
// machine's UTC hour, the client sees local time \u2014 rendering it during
// hydration caused a React #418 text mismatch on every /coach load.
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default memo(function DashboardGreeting({ coachName, needsAttention }: DashboardGreetingProps) {
  const [greeting, setGreeting] = useState('Welcome back');
  useEffect(() => { setGreeting(getGreeting()); }, []);

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
        className="text-[var(--content-primary)] text-xl sm:text-2xl font-bold"
      >
        {greeting}, {coachName}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="text-[var(--content-secondary)] text-sm mt-1"
      >
        {needsAttention > 0 ? (
          <>
            <span className="text-[var(--action-primary)] font-semibold">{needsAttention}</span>
            {' '}client{needsAttention !== 1 ? 's' : ''} need{needsAttention === 1 ? 's' : ''} attention today
          </>
        ) : (
          <span>All clients on track</span>
        )}
      </motion.p>
    </motion.div>
  );
});

'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Tiny stagger wrapper — parent + child variants, 0.04s stagger.
 * Wrap a list in <Stagger> and each row in <StaggerItem>; rows fade/slide
 * in one after another. No-ops (instant show) under prefers-reduced-motion.
 */

export function Stagger({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : 'hidden'}
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.04, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={
        reducedMotion
          ? {}
          : {
              hidden: { opacity: 0, y: 8 },
              show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
            }
      }
    >
      {children}
    </motion.div>
  );
}

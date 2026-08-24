'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';

const routeOrder = [
  '/dashboard',
  '/dashboard/log',
  '/dashboard/workout',
  '/dashboard/progress',
  '/dashboard/profile',
] as const;

function routeIndex(pathname: string): number {
  const exact = routeOrder.indexOf(pathname as (typeof routeOrder)[number]);
  if (exact >= 0) return exact;
  const nested = routeOrder.findIndex((route, index) => index > 0 && pathname.startsWith(`${route}/`));
  return nested >= 0 ? nested : 0;
}

export function ClientRouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const currentIndex = routeIndex(pathname);
  const [previousIndex, setPreviousIndex] = useState(currentIndex);
  const direction = currentIndex === previousIndex ? 0 : currentIndex > previousIndex ? 1 : -1;

  return (
    <AnimatePresence mode="popLayout" initial={false} custom={direction}>
      <motion.div
        key={pathname}
        className="client-shell__content"
        custom={direction}
        initial={reduceMotion ? false : { opacity: 0.72, x: direction * 28, scale: 0.992 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0.72, x: direction * -22, scale: 0.992 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => setPreviousIndex(currentIndex)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

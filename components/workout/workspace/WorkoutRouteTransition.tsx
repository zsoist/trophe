'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { WorkoutRouteFocusProvider } from '@/components/workout/workspace/WorkoutRouteFocusContext';
import { workoutRouteIndex } from '@/lib/workout/workspace-routes';

export function WorkoutRouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routePathname = pathname.split('?')[0];
  const reducedMotion = useReducedMotion();
  const [previousPathname, setPreviousPathname] = useState(routePathname);
  const hydrated = useRef(false);
  const routeSurface = useRef<HTMLDivElement>(null);
  const previousIndex = workoutRouteIndex(previousPathname);
  const currentIndex = workoutRouteIndex(pathname);
  const changed = routePathname !== previousPathname;
  const direction = !changed ? 'none' : currentIndex > previousIndex ? 'forward' : 'back';

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
    }
  }, []);

  const attachRouteSurface = useCallback((node: HTMLDivElement | null) => {
    routeSurface.current = node;
    if (!node || !hydrated.current || !changed) return;
    queueMicrotask(() => {
      const destination = node.querySelector<HTMLElement>('main');
      if (!destination || !node.isConnected) return;
      if (!destination.hasAttribute('tabindex')) destination.tabIndex = -1;
      destination.dataset.workoutRouteFocusTarget = 'true';
      destination.focus({ preventScroll: true });
    });
  }, [changed]);

  const offset = direction === 'forward' ? 18 : direction === 'back' ? -18 : 0;
  const animateRoute = changed && !reducedMotion;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        ref={attachRouteSurface}
        key={routePathname}
        data-testid="workout-route-transition"
        data-route-direction={direction}
        className="workout-route-transition"
        initial={animateRoute ? { opacity: 0.86, x: offset } : false}
        animate={{ opacity: 1, x: 0 }}
        exit={animateRoute ? { opacity: 0.92, x: -offset * 0.5 } : undefined}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => setPreviousPathname(routePathname)}
      >
        <WorkoutRouteFocusProvider>{children}</WorkoutRouteFocusProvider>
      </motion.div>
    </AnimatePresence>
  );
}

'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { WorkoutRouteFocusProvider } from '@/components/workout/workspace/WorkoutRouteFocusContext';
import { workoutRouteIndex } from '@/lib/workout/workspace-routes';

export function WorkoutRouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routePathname = pathname.split('?')[0];
  const reducedMotion = useReducedMotion();
  const hydrated = useRef(false);
  const routeSurface = useRef<HTMLDivElement>(null);
  const focusedRoute = useRef<string | null>(null);
  const lastRoute = useRef(routePathname);
  // The navigation record advances from the committed pathname, never from
  // framer's onAnimationComplete. A zero-duration (reduced-motion) swap and an
  // interrupted exit never fire that callback, which used to freeze the
  // previous route: the next back-navigation to an already-seen route then
  // looked like "no change" and skipped both the transition and the
  // destination focus handoff.
  const [navigation, setNavigation] = useState<{ from: string; to: string } | null>(null);

  useLayoutEffect(() => {
    const from = lastRoute.current;
    if (from === routePathname) return;
    lastRoute.current = routePathname;
    setNavigation({ from, to: routePathname });
  }, [routePathname]);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
    }
  }, []);

  // Direction and the enter/exit decision stay pinned to the mounted surface's
  // own navigation, so a later query-only render cannot reinterpret it.
  const current = navigation?.to === routePathname ? navigation : null;
  const changed = current !== null;
  const direction = !current
    ? 'none'
    : workoutRouteIndex(routePathname) > workoutRouteIndex(current.from)
      ? 'forward'
      : 'back';

  const attachRouteSurface = useCallback((node: HTMLDivElement | null) => {
    routeSurface.current = node;
    if (!node || !hydrated.current) return;
    queueMicrotask(() => {
      // The exit phase can hand back a superseded surface; focus only the
      // surface that is still mounted and never re-focus the same route.
      if (routeSurface.current !== node || !node.isConnected) return;
      if (focusedRoute.current === routePathname) return;
      const destination = node.querySelector<HTMLElement>('main');
      if (!destination) return;
      focusedRoute.current = routePathname;
      if (!destination.hasAttribute('tabindex')) destination.tabIndex = -1;
      destination.dataset.workoutRouteFocusTarget = 'true';
      destination.focus({ preventScroll: true });
    });
  }, [routePathname]);

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
      >
        <WorkoutRouteFocusProvider>{children}</WorkoutRouteFocusProvider>
      </motion.div>
    </AnimatePresence>
  );
}

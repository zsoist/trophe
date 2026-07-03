'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * RAF count-up number — extracted from ProgressComparison's AnimatedNumber.
 *
 * Cubic ease-out over ~900ms, re-animates from the previous value when
 * `value` changes. Under prefers-reduced-motion the value is set instantly
 * (no animation frames scheduled).
 */

interface AnimatedValueProps {
  value: number;
  /** Decimal places to render (default 0). */
  decimals?: number;
  className?: string;
  /** Animation duration in ms (default 900). */
  duration?: number;
  /** Use locale thousand separators (default true). */
  grouped?: boolean;
  /** Value the FIRST roll starts from (default 0). Lets steppers roll old→new on mount. */
  startAt?: number;
}

export function AnimatedValue({
  value,
  decimals = 0,
  className = '',
  duration = 900,
  grouped = true,
  startAt = 0,
}: AnimatedValueProps) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(() => (reducedMotion ? value : startAt));
  const prevRef = useRef(reducedMotion ? value : startAt);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (reducedMotion) {
      // Rendered directly below — no animation frames scheduled.
      prevRef.current = value;
      return;
    }
    const start = prevRef.current;
    const t0 = performance.now();

    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (value - start) * eased);
      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration, reducedMotion]);

  const shown = reducedMotion ? value : display;
  const formatted = grouped
    ? shown.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : shown.toFixed(decimals);

  return <span className={`tabular-nums ${className}`}>{formatted}</span>;
}

export default AnimatedValue;

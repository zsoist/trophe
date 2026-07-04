'use client';

/**
 * W11 — photo scan-reveal. The captured plate gets an accent-colored beam
 * sweeping while the vision model reads it ('scanning'), then a single
 * settle pass + border flash when results land ('done'). Pure CSS keyframes
 * for the loop (no JS timers), framer only for the one-shot settle.
 * Reduced-motion: static photo, no beam.
 */

import { motion, useReducedMotion } from 'framer-motion';

export default function PhotoScanCard({ src, state }: { src: string; state: 'scanning' | 'done' }) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="mb-2 flex justify-center">
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'relative', overflow: 'hidden', borderRadius: 16,
          width: state === 'scanning' ? 168 : 84,
          height: state === 'scanning' ? 168 : 84,
          border: '1px solid',
          borderColor: state === 'done' ? 'var(--accent, #D4A853)' : 'rgba(255,255,255,.12)',
          transition: 'width .35s ease, height .35s ease, border-color .4s ease',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          aria-hidden
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {!reducedMotion && state === 'scanning' && (
          <>
            {/* Sweeping beam — CSS loop, accent-tinted */}
            <span aria-hidden className="photo-scan-beam" />
            {/* Faint grid shimmer under the beam */}
            <span aria-hidden className="photo-scan-grid" />
          </>
        )}
        {!reducedMotion && state === 'done' && (
          <motion.span
            aria-hidden
            initial={{ top: '-12%' }}
            animate={{ top: '112%' }}
            transition={{ duration: 0.5, ease: 'easeIn' }}
            style={{
              position: 'absolute', left: 0, right: 0, height: 10, pointerEvents: 'none',
              background: 'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--accent, #D4A853) 65%, transparent), transparent)',
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

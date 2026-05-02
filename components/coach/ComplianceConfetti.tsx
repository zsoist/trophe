'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';

// ═══════════════════════════════════════════════
// τροφή — Compliance Confetti Burst (Wave 4)
// Gold/stone confetti when all clients are on track
// ═══════════════════════════════════════════════

interface ComplianceConfettiProps {
  trigger: boolean;
}

interface ConfettiPiece {
  id: number;
  x: number;
  endY: number;
  rotation: number;
  size: number;
  color: string;
  shape: 'square' | 'circle' | 'rect';
  delay: number;
  duration: number;
  drift: number;
}

const CONFETTI_COLORS = [
  '#D4A853',
  'rgba(212,168,83,0.7)',
  '#fbbf24',
  '#a8a29e',
  '#78716c',
  'rgba(212,168,83,0.4)',
  '#f5f5f4',
  '#d6d3d1',
];

function generatePieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    endY: 100 + Math.random() * 40,
    rotation: Math.random() * 1080 - 540,
    size: Math.random() * 8 + 4,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    shape: (['square', 'circle', 'rect'] as const)[Math.floor(Math.random() * 3)],
    delay: Math.random() * 0.4,
    duration: 1.8 + Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 60,
  }));
}

export default function ComplianceConfetti({ trigger }: ComplianceConfettiProps) {
  const [show, setShow] = useState(false);
  const pieces = useMemo(() => generatePieces(30), []);

  useEffect(() => {
    if (trigger) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(true);
      const timer = setTimeout(() => setShow(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {pieces.map((piece) => {
            const width = piece.shape === 'rect' ? piece.size * 1.5 : piece.size;
            const height = piece.shape === 'rect' ? piece.size * 0.6 : piece.size;

            return (
              <motion.div
                key={piece.id}
                className="absolute"
                style={{
                  left: `${piece.x}%`,
                  top: '-5%',
                  width,
                  height,
                  backgroundColor: piece.color,
                  borderRadius: piece.shape === 'circle' ? '50%' : '1px',
                }}
                initial={{
                  y: 0,
                  x: 0,
                  rotate: 0,
                  opacity: 1,
                  scale: 0,
                }}
                animate={{
                  y: `${piece.endY}vh`,
                  x: piece.drift,
                  rotate: piece.rotation,
                  opacity: [0, 1, 1, 0],
                  scale: [0, 1, 1, 0.6],
                }}
                transition={{
                  duration: piece.duration,
                  delay: piece.delay,
                  ease: [0.15, 0.8, 0.4, 1],
                }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

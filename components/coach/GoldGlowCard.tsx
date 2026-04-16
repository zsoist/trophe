'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

// ═══════════════════════════════════════════════
// τροφή — Gold Glow Card Wrapper (Wave 4)
// Premium glass card with gold hover glow effect
// ═══════════════════════════════════════════════

interface GoldGlowCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}

export default function GoldGlowCard({ children, className = '', glow = true }: GoldGlowCardProps) {
  return (
    <motion.div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      whileHover={
        glow
          ? {
              boxShadow: '0 0 20px rgba(212,168,83,0.15), 0 0 40px rgba(212,168,83,0.05)',
              borderColor: 'rgba(212,168,83,0.2)',
            }
          : undefined
      }
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Subtle gold gradient on hover — always present but only visible on hover */}
      {glow && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            background:
              'linear-gradient(135deg, rgba(212,168,83,0.04) 0%, transparent 40%, transparent 60%, rgba(212,168,83,0.02) 100%)',
            opacity: 0,
          }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 p-5">{children}</div>
    </motion.div>
  );
}

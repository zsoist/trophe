'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FlaskConical, Shield } from 'lucide-react';

interface Supplement {
  name: string;
  dose: string;
  timing: string;
}

interface Protocol {
  id: string;
  name: string;
  emoji: string;
  description: string;
  evidenceLevel: 'A' | 'B' | 'C' | 'D';
  supplements: Supplement[];
}

interface ProtocolTemplateLibraryProps {
  onSelect: (protocol: {
    id: string;
    name: string;
    supplements: Supplement[];
    evidenceLevel: string;
  }) => void;
}

const EVIDENCE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: 'var(--status-success-fg)', bg: 'var(--status-success-bg)', label: 'Strong evidence' },
  B: { color: 'var(--action-primary)', bg: 'var(--status-warning-bg)', label: 'Moderate evidence' },
  C: { color: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', label: 'Limited evidence' },
  D: { color: 'var(--status-danger-fg)', bg: 'var(--status-danger-bg)', label: 'Emerging evidence' },
};

const PROTOCOLS: Protocol[] = [
  {
    id: 'fat-loss',
    name: 'Fat Loss Stack',
    emoji: '\uD83D\uDD25',
    description: 'Thermogenic + metabolic support for fat loss phases',
    evidenceLevel: 'B',
    supplements: [
      { name: 'Green Tea Extract', dose: '500mg', timing: 'Morning' },
      { name: 'L-Carnitine', dose: '2g', timing: 'Pre-workout' },
      { name: 'CLA', dose: '3g', timing: 'With meals' },
      { name: 'Vitamin D', dose: '2000IU', timing: 'Morning' },
    ],
  },
  {
    id: 'muscle-gain',
    name: 'Muscle Gain Stack',
    emoji: '\uD83D\uDCAA',
    description: 'Performance + recovery for hypertrophy phases',
    evidenceLevel: 'A',
    supplements: [
      { name: 'Creatine', dose: '5g', timing: 'Post-workout' },
      { name: 'Beta-Alanine', dose: '3.2g', timing: 'Pre-workout' },
      { name: 'Whey Protein', dose: '25g', timing: 'Post-workout' },
      { name: 'ZMA', dose: '30mg Zn / 450mg Mg', timing: 'Evening' },
    ],
  },
  {
    id: 'recovery',
    name: 'Recovery Stack',
    emoji: '\uD83E\uDDD8',
    description: 'Anti-inflammatory + restorative for recovery support',
    evidenceLevel: 'B',
    supplements: [
      { name: 'Omega-3 Fish Oil', dose: '2g', timing: 'With meals' },
      { name: 'Magnesium', dose: '400mg', timing: 'Evening' },
      { name: 'Vitamin C', dose: '1000mg', timing: 'Morning' },
      { name: 'Glutamine', dose: '5g', timing: 'Post-workout' },
    ],
  },
];

export default memo(function ProtocolTemplateLibrary({ onSelect }: ProtocolTemplateLibraryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleSelect = useCallback(
    (protocol: Protocol) => {
      onSelect({
        id: protocol.id,
        name: protocol.name,
        supplements: protocol.supplements,
        evidenceLevel: protocol.evidenceLevel,
      });
    },
    [onSelect],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl p-4"
    >
      <h3 className="text-[var(--content-secondary)] text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
        <FlaskConical size={14} className="text-[var(--action-primary)]" />
        Protocol Templates
      </h3>

      <div className="space-y-2">
        {PROTOCOLS.map((protocol) => {
          const isOpen = expandedId === protocol.id;
          const evidence = EVIDENCE_COLORS[protocol.evidenceLevel];

          return (
            <div
              key={protocol.id}
              className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--surface-hover)]"
            >
              {/* Card header */}
              <button
                type="button"
                onClick={() => toggle(protocol.id)}
                className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] transition-colors text-left"
              >
                <span className="text-lg flex-shrink-0">{protocol.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--content-primary)] text-sm font-semibold">{protocol.name}</p>
                  <p className="text-[var(--content-muted)] text-xs truncate">{protocol.description}</p>
                </div>

                {/* Evidence badge */}
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0"
                  style={{ backgroundColor: evidence.bg }}
                  title={evidence.label}
                >
                  <Shield size={10} style={{ color: evidence.color }} />
                  <span className="text-xs font-semibold" style={{ color: evidence.color }}>
                    {protocol.evidenceLevel}
                  </span>
                </div>

                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} className="text-[var(--content-muted)]" />
                </motion.div>
              </button>

              {/* Expanded detail */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2">
                      {/* Supplements table */}
                      <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                        <div className="grid grid-cols-3 gap-px bg-[var(--surface-hover)]">
                          <div className="bg-[var(--surface-1)] px-2.5 py-1.5 text-xs font-semibold text-[var(--content-muted)] uppercase tracking-wider">
                            Supplement
                          </div>
                          <div className="bg-[var(--surface-1)] px-2.5 py-1.5 text-xs font-semibold text-[var(--content-muted)] uppercase tracking-wider">
                            Dose
                          </div>
                          <div className="bg-[var(--surface-1)] px-2.5 py-1.5 text-xs font-semibold text-[var(--content-muted)] uppercase tracking-wider">
                            Timing
                          </div>
                        </div>
                        {protocol.supplements.map((supp, si) => (
                          <motion.div
                            key={si}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: si * 0.05 }}
                            className="grid grid-cols-3 gap-px bg-[var(--surface-hover)]"
                          >
                            <div className="bg-[var(--surface-1)]/80 px-2.5 py-2 text-xs text-[var(--content-primary)]">
                              {supp.name}
                            </div>
                            <div className="bg-[var(--surface-1)]/80 px-2.5 py-2 text-xs text-[var(--action-primary)] font-mono">
                              {supp.dose}
                            </div>
                            <div className="bg-[var(--surface-1)]/80 px-2.5 py-2 text-xs text-[var(--content-secondary)]">
                              {supp.timing}
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Evidence note */}
                      <p className="text-[var(--content-muted)] text-xs flex items-center gap-1">
                        <Shield size={10} style={{ color: evidence.color }} />
                        {evidence.label}
                      </p>

                      {/* Use button */}
                      <button
                        type="button"
                        onClick={() => handleSelect(protocol)}
                        className="min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] w-full py-2 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
                        style={{
                          backgroundColor: 'var(--status-warning-bg)',
                          color: 'var(--action-primary)',
                          borderWidth: 1,
                          borderColor: 'var(--status-warning-border)',
                        }}
                      >
                        Use This Protocol
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
});

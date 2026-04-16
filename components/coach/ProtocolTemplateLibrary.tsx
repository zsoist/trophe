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
  A: { color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)', label: 'Strong evidence' },
  B: { color: '#D4A853', bg: 'rgba(212, 168, 83, 0.15)', label: 'Moderate evidence' },
  C: { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', label: 'Limited evidence' },
  D: { color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', label: 'Emerging evidence' },
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
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
        <FlaskConical size={14} className="text-[#D4A853]" />
        Protocol Templates
      </h3>

      <div className="space-y-2">
        {PROTOCOLS.map((protocol) => {
          const isOpen = expandedId === protocol.id;
          const evidence = EVIDENCE_COLORS[protocol.evidenceLevel];

          return (
            <div
              key={protocol.id}
              className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.02]"
            >
              {/* Card header */}
              <button
                type="button"
                onClick={() => toggle(protocol.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.03] transition-colors text-left"
              >
                <span className="text-lg flex-shrink-0">{protocol.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-stone-200 text-sm font-semibold">{protocol.name}</p>
                  <p className="text-stone-500 text-[10px] truncate">{protocol.description}</p>
                </div>

                {/* Evidence badge */}
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0"
                  style={{ backgroundColor: evidence.bg }}
                  title={evidence.label}
                >
                  <Shield size={10} style={{ color: evidence.color }} />
                  <span className="text-[9px] font-semibold" style={{ color: evidence.color }}>
                    {protocol.evidenceLevel}
                  </span>
                </div>

                <motion.div
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} className="text-stone-500" />
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
                      <div className="border border-white/[0.06] rounded-lg overflow-hidden">
                        <div className="grid grid-cols-3 gap-px bg-white/[0.04]">
                          <div className="bg-stone-950 px-2.5 py-1.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                            Supplement
                          </div>
                          <div className="bg-stone-950 px-2.5 py-1.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                            Dose
                          </div>
                          <div className="bg-stone-950 px-2.5 py-1.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                            Timing
                          </div>
                        </div>
                        {protocol.supplements.map((supp, si) => (
                          <motion.div
                            key={si}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: si * 0.05 }}
                            className="grid grid-cols-3 gap-px bg-white/[0.04]"
                          >
                            <div className="bg-stone-950/80 px-2.5 py-2 text-xs text-stone-200">
                              {supp.name}
                            </div>
                            <div className="bg-stone-950/80 px-2.5 py-2 text-xs text-[#D4A853] font-mono">
                              {supp.dose}
                            </div>
                            <div className="bg-stone-950/80 px-2.5 py-2 text-xs text-stone-400">
                              {supp.timing}
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Evidence note */}
                      <p className="text-stone-600 text-[10px] flex items-center gap-1">
                        <Shield size={10} style={{ color: evidence.color }} />
                        {evidence.label}
                      </p>

                      {/* Use button */}
                      <button
                        type="button"
                        onClick={() => handleSelect(protocol)}
                        className="w-full py-2 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2"
                        style={{
                          backgroundColor: 'rgba(212, 168, 83, 0.15)',
                          color: '#D4A853',
                          borderWidth: 1,
                          borderColor: 'rgba(212, 168, 83, 0.3)',
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

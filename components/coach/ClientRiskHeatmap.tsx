'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';

interface ClientCell {
  name: string;
  status: 'green' | 'yellow' | 'red';
  adherence: number;
}

interface ClientRiskHeatmapProps {
  clients: ClientCell[];
}

const STATUS_COLORS: Record<ClientCell['status'], { bg: string; border: string; label: string }> = {
  green: {
    bg: 'rgba(74, 222, 128, 0.35)',
    border: 'rgba(74, 222, 128, 0.5)',
    label: 'On Track',
  },
  yellow: {
    bg: 'rgba(212, 168, 83, 0.35)',
    border: 'rgba(212, 168, 83, 0.5)',
    label: 'Needs Attention',
  },
  red: {
    bg: 'rgba(248, 113, 113, 0.35)',
    border: 'rgba(248, 113, 113, 0.5)',
    label: 'At Risk',
  },
};

export default memo(function ClientRiskHeatmap({ clients }: ClientRiskHeatmapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const sorted = [...clients].sort((a, b) => {
    const order = { red: 0, yellow: 1, green: 2 };
    return order[a.status] - order[b.status];
  });

  const counts = {
    green: clients.filter((c) => c.status === 'green').length,
    yellow: clients.filter((c) => c.status === 'yellow').length,
    red: clients.filter((c) => c.status === 'red').length,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
          Client Risk Map
        </h3>
        <div className="flex items-center gap-3">
          {(['green', 'yellow', 'red'] as const).map((status) => (
            <div key={status} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: STATUS_COLORS[status].bg }}
              />
              <span className="text-stone-500 text-[10px]">
                {counts[status]} {STATUS_COLORS[status].label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 relative">
        {sorted.map((client, i) => {
          const colors = STATUS_COLORS[client.status];
          return (
            <motion.div
              key={`${client.name}-${i}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.02, duration: 0.3 }}
              className="relative aspect-square rounded-md cursor-pointer transition-transform hover:scale-110"
              style={{
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onTouchStart={() => setHoveredIndex(i)}
              onTouchEnd={() => setHoveredIndex(null)}
            >
              {hoveredIndex === i && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 whitespace-nowrap"
                >
                  <div className="bg-stone-900 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl">
                    <p className="text-stone-200 text-[10px] font-medium">{client.name}</p>
                    <p className="text-stone-400 text-[9px]">
                      {client.adherence}% adherence
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {clients.length === 0 && (
        <p className="text-stone-500 text-xs text-center py-6">No clients yet</p>
      )}
    </motion.div>
  );
});

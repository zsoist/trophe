'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui';

const MYTHS = [
  'Eating every 2-3h doesn\'t speed up metabolism. Total daily intake matters more.',
  'Skipping breakfast doesn\'t slow metabolism. Choose the pattern that works for you.',
  'Carbs at night don\'t automatically become fat. Caloric surplus determines fat gain.',
  'High protein (up to 3.4g/kg) doesn\'t damage healthy kidneys. Stay hydrated.',
  'The anabolic window lasts hours, not 30 minutes. Eat protein when convenient.',
  'Detox products don\'t remove toxins. Your liver and kidneys handle that.',
  'Spot reduction doesn\'t work. Fat loss is systemic, not localized.',
  'BCAAs are unnecessary if you eat enough protein (>1.6g/kg/day).',
  'Keto isn\'t superior for fat loss. Caloric deficit matters, not carb restriction.',
  'Sweating more doesn\'t burn more fat. It\'s just water and electrolyte loss.',
];

export default function MythCard() {
  const [todayMyth] = useState(() => {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((today.getTime() - startOfYear.getTime()) / 86400000);
    return MYTHS[dayOfYear % MYTHS.length];
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="glass p-4 mb-4"
      style={{ borderColor: 'rgba(212, 168, 83, 0.2)', borderWidth: 1 }}
    >
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 mt-0.5 text-[#D4A853]"><Icon name="i-sparkle" size={18} /></span>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-[#D4A853] uppercase tracking-wider mb-1.5">
            Did you know?
          </h4>
          <p className="text-stone-300 text-sm leading-relaxed">
            {todayMyth}
          </p>
          <p className="text-stone-600 text-[10px] mt-2">
            Source: ISSN / ACSM / IOC
          </p>
        </div>
      </div>
    </motion.div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';

export default function ProgressPhotos() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="glass p-5 mb-4"
      style={{ borderColor: 'rgba(212, 168, 83, 0.2)', borderWidth: 1 }}
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <Camera size={14} className="text-[#D4A853]" />
        Progress Photos
      </h3>

      <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02]">
        <div className="w-14 h-14 rounded-full bg-[#D4A853]/10 flex items-center justify-center mb-3">
          <span className="text-2xl">📸</span>
        </div>
        <p className="text-stone-300 text-sm font-medium mb-1">
          Upload your first progress photo
        </p>
        <p className="text-stone-600 text-xs text-center max-w-[260px] leading-relaxed">
          Photos are taken every 30 days. Your coach can review them during sessions.
        </p>
        <button
          disabled
          className="mt-4 text-xs px-4 py-2 rounded-xl border border-[#D4A853]/20 text-[#D4A853]/60 bg-[#D4A853]/5 cursor-not-allowed"
        >
          Coming Soon
        </button>
      </div>
    </motion.div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function ProgressPhotos() {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="glass p-5 mb-4"
      style={{ borderColor: 'rgba(212, 168, 83, 0.2)', borderWidth: 1 }}
    >
      <h3 className="text-[var(--content-primary)] text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <Camera size={14} className="text-[#D4A853]" />
        {t('progressphotos.title')}
      </h3>

      <div className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)]">
        <div className="w-14 h-14 rounded-full bg-[#D4A853]/10 flex items-center justify-center mb-3 text-[#D4A853]">
          <Icon name="i-camera" size={26} />
        </div>
        <p className="text-[var(--content-primary)] text-sm font-medium mb-1">
          {t('progressphotos.upload_first')}
        </p>
        <p className="text-[var(--content-muted)] text-xs text-center max-w-[260px] leading-relaxed">
          {t('progressphotos.description')}
        </p>
        <button
          disabled
          className="mt-4 text-xs px-4 py-2 rounded-xl border border-[#D4A853]/20 text-[#D4A853]/60 bg-[#D4A853]/5 cursor-not-allowed"
        >
          {t('progressphotos.coming_soon')}
        </button>
      </div>
    </motion.div>
  );
}

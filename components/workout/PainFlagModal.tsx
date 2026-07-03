'use client';

/**
 * Pain flag modal — shared by the freestyle logger (app/dashboard/workout/page.tsx)
 * and guided mode (components/workout/GuidedSession.tsx).
 * Extracted unchanged from the workout page during the guided-training rebuild.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type { PainFlag } from '@/lib/types';

export default function PainFlagModal({
  exerciseId,
  onSave,
  onClose,
}: {
  exerciseId: string;
  onSave: (flag: PainFlag) => void;
  onClose: () => void;
}) {
  const [bodyPart, setBodyPart] = useState('');
  const [severity, setSeverity] = useState(1);
  const [notes, setNotes] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-elevated p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-red-400" />
          <h3 className="text-lg font-semibold">Pain Flag</h3>
        </div>

        <input
          type="text"
          placeholder="Body part (e.g. left shoulder)"
          value={bodyPart}
          onChange={(e) => setBodyPart(e.target.value)}
          className="input-dark mb-3"
        />

        <div className="mb-3">
          <label className="text-sm text-stone-400 mb-1 block">
            Severity: {severity}/5
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: severity >= s
                    ? `rgba(239, 68, 68, ${0.2 + s * 0.15})`
                    : 'rgba(255,255,255,0.05)',
                  color: severity >= s ? '#fca5a5' : '#78716c',
                  border: severity >= s
                    ? '1px solid rgba(239,68,68,0.3)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input-dark mb-4 h-16 resize-none"
        />

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 text-sm py-2">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!bodyPart.trim()) return;
              onSave({
                exercise_id: exerciseId,
                body_part: bodyPart.trim(),
                severity,
                notes: notes.trim() || undefined,
              });
              onClose();
            }}
            className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: 'rgba(239,68,68,0.2)',
              color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            Save Flag
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

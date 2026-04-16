'use client';

import { memo, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Check, Users } from 'lucide-react';

interface BatchClient {
  id: string;
  name: string;
  selected: boolean;
}

interface BatchNoteProps {
  clients: BatchClient[];
  onSend: (note: string, type: string, clientIds: string[]) => void;
  onClose: () => void;
}

type NoteType = 'check_in' | 'concern' | 'general';

const NOTE_TYPES: Array<{ key: NoteType; label: string; emoji: string }> = [
  { key: 'check_in', label: 'Check-in', emoji: '\u2705' },
  { key: 'concern', label: 'Concern', emoji: '\u26A0\uFE0F' },
  { key: 'general', label: 'General', emoji: '\uD83D\uDCDD' },
];

export default memo(function BatchNote({ clients, onSend, onClose }: BatchNoteProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    clients.forEach((c) => {
      if (c.selected) initial.add(c.id);
    });
    return initial;
  });
  const [note, setNote] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('check_in');

  const canSend = useMemo(() => note.trim().length > 0 && selectedIds.size > 0, [note, selectedIds]);

  const toggleClient = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === clients.length) return new Set();
      return new Set(clients.map((c) => c.id));
    });
  }, [clients]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(note.trim(), noteType, Array.from(selectedIds));
  }, [canSend, note, noteType, selectedIds, onSend]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md bg-stone-950 border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-stone-200 text-sm font-semibold flex items-center gap-2">
              <Users size={14} className="text-[#D4A853]" />
              Batch Note
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-500 hover:text-stone-300 transition-colors p-1"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Client list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-stone-400 text-xs">
                  {selectedIds.size} of {clients.length} selected
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[#D4A853] text-[10px] font-semibold hover:underline"
                >
                  {selectedIds.size === clients.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="max-h-[140px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-1">
                {clients.map((client) => {
                  const isSelected = selectedIds.has(client.id);
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => toggleClient(client.id)}
                      className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left"
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors"
                        style={{
                          borderColor: isSelected ? '#D4A853' : 'rgba(255,255,255,0.12)',
                          backgroundColor: isSelected ? 'rgba(212, 168, 83, 0.2)' : 'transparent',
                        }}
                      >
                        {isSelected && <Check size={10} style={{ color: '#D4A853' }} />}
                      </div>
                      <span className={`text-xs ${isSelected ? 'text-stone-200' : 'text-stone-500'}`}>
                        {client.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note type */}
            <div className="flex gap-1.5">
              {NOTE_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setNoteType(t.key)}
                  className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-center gap-1"
                  style={{
                    backgroundColor:
                      noteType === t.key ? 'rgba(212, 168, 83, 0.15)' : 'rgba(255,255,255,0.03)',
                    color: noteType === t.key ? '#D4A853' : '#78716c',
                    borderWidth: 1,
                    borderColor:
                      noteType === t.key ? 'rgba(212, 168, 83, 0.3)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Write your note here..."
              rows={4}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-stone-200 text-sm placeholder:text-stone-600 resize-none focus:outline-none focus:border-[#D4A853]/40 transition-colors"
            />

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'rgba(212, 168, 83, 0.15)',
                color: '#D4A853',
                borderWidth: 1,
                borderColor: 'rgba(212, 168, 83, 0.3)',
              }}
            >
              <Send size={14} />
              Send to {selectedIds.size} Client{selectedIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ChevronDown } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  selected: boolean;
}

interface Habit {
  id: string;
  name: string;
  emoji: string;
}

interface BatchHabitAssignProps {
  clients: Client[];
  habits: Habit[];
  onAssign: (habitId: string, clientIds: string[]) => void;
  onClose: () => void;
}

export default memo(function BatchHabitAssign({
  clients: initialClients,
  habits,
  onAssign,
  onClose,
}: BatchHabitAssignProps) {
  const [clientState, setClientState] = useState<Client[]>(initialClients);
  const [selectedHabitId, setSelectedHabitId] = useState<string>(habits[0]?.id ?? '');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedCount = clientState.filter((c) => c.selected).length;
  const selectedHabit = habits.find((h) => h.id === selectedHabitId);

  const toggleClient = useCallback((id: string) => {
    setClientState((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  }, []);

  const toggleAll = useCallback(() => {
    const allSelected = clientState.every((c) => c.selected);
    setClientState((prev) => prev.map((c) => ({ ...c, selected: !allSelected })));
  }, [clientState]);

  const handleAssign = useCallback(() => {
    if (!selectedHabitId || selectedCount === 0) return;
    const selectedIds = clientState.filter((c) => c.selected).map((c) => c.id);
    onAssign(selectedHabitId, selectedIds);
  }, [selectedHabitId, selectedCount, clientState, onAssign]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 30 }}
          className="w-full max-w-md bg-stone-900 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h2 className="text-stone-200 text-sm font-semibold">Assign Habit</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
            >
              <X size={16} className="text-stone-400" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Habit selector */}
            <div>
              <label className="text-stone-400 text-[10px] uppercase tracking-wider font-medium block mb-1.5">
                Habit
              </label>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-stone-200 text-sm hover:bg-white/[0.06] transition-colors"
                >
                  <span>
                    {selectedHabit ? `${selectedHabit.emoji} ${selectedHabit.name}` : 'Select habit...'}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-stone-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 z-10 bg-stone-800 border border-white/[0.08] rounded-xl overflow-hidden shadow-xl max-h-40 overflow-y-auto"
                    >
                      {habits.map((habit) => (
                        <button
                          key={habit.id}
                          onClick={() => {
                            setSelectedHabitId(habit.id);
                            setDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/[0.06] transition-colors ${
                            habit.id === selectedHabitId ? 'bg-white/[0.04] text-[#D4A853]' : 'text-stone-300'
                          }`}
                        >
                          <span>{habit.emoji}</span>
                          <span>{habit.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Client list */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-stone-400 text-[10px] uppercase tracking-wider font-medium">
                  Clients ({selectedCount}/{clientState.length})
                </label>
                <button
                  onClick={toggleAll}
                  className="text-[10px] text-[#D4A853] hover:text-[#e0be6e] transition-colors"
                >
                  {clientState.every((c) => c.selected) ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-1">
                {clientState.map((client, i) => (
                  <motion.button
                    key={client.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => toggleClient(client.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      client.selected ? 'bg-[#D4A853]/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                        client.selected
                          ? 'bg-[#D4A853] border-[#D4A853]'
                          : 'border border-white/20 bg-transparent'
                      }`}
                    >
                      {client.selected && <Check size={10} className="text-stone-900" />}
                    </div>
                    <span className="text-stone-200 text-sm">{client.name}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/[0.06] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-400 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={selectedCount === 0 || !selectedHabitId}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: selectedCount > 0 ? '#D4A853' : 'rgba(212,168,83,0.3)',
                color: '#1c1917',
              }}
            >
              Assign to {selectedCount} client{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

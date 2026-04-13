'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pill, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface SupplementRow {
  name: string;
  days: ('taken' | 'missed' | 'none')[];
  compliance: number;
}

// ═══════════════════════════════════════════════
// Supplement Compliance Grid
// ═══════════════════════════════════════════════

export default function SupplementCompliance({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<SupplementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCompliance = useCallback(async () => {
    try {
      // Get current week Mon-Sun
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const mondayStr = monday.toISOString().split('T')[0];

      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const sundayStr = sunday.toISOString().split('T')[0];

      // Get active supplement protocols for this client
      const { data: clientSupps } = await supabase
        .from('client_supplements')
        .select('*, protocol:supplement_protocols(*)')
        .eq('user_id', clientId)
        .eq('active', true);

      if (!clientSupps || clientSupps.length === 0) {
        setLoading(false);
        return;
      }

      // Collect all supplement names from protocols
      const supplementNames: string[] = [];
      clientSupps.forEach((cs: { protocol?: { supplements?: { name: string }[] } }) => {
        if (cs.protocol?.supplements) {
          cs.protocol.supplements.forEach((s: { name: string }) => {
            if (!supplementNames.includes(s.name)) {
              supplementNames.push(s.name);
            }
          });
        }
      });

      if (supplementNames.length === 0) {
        setLoading(false);
        return;
      }

      // Query supplement_log for the week
      const { data: logs } = await supabase
        .from('supplement_log')
        .select('*')
        .eq('user_id', clientId)
        .gte('logged_date', mondayStr)
        .lte('logged_date', sundayStr);

      const logEntries = logs || [];

      // Build the grid
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const builtRows: SupplementRow[] = supplementNames.map((name) => {
        const days: ('taken' | 'missed' | 'none')[] = [];
        let takenCount = 0;
        let applicableDays = 0;

        for (let i = 0; i < 7; i++) {
          const d = new Date(monday);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];

          if (d > today) {
            days.push('none');
          } else {
            applicableDays++;
            const entry = logEntries.find(
              (l: { supplement_name: string; logged_date: string; taken: boolean }) =>
                l.supplement_name === name && l.logged_date === dateStr
            );
            if (entry && entry.taken) {
              days.push('taken');
              takenCount++;
            } else {
              days.push('missed');
            }
          }
        }

        const compliance = applicableDays > 0
          ? Math.round((takenCount / applicableDays) * 100)
          : 0;

        return { name, days, compliance };
      });

      setRows(builtRows);
    } catch (err) {
      console.error('Error loading supplement compliance:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadCompliance();
  }, [loadCompliance]);

  if (loading) {
    return (
      <div className="text-center py-6 text-stone-600 text-sm">
        Loading supplements...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-6">
        <Pill size={24} className="mx-auto text-stone-700 mb-2" />
        <p className="text-stone-600 text-sm">No supplement protocol assigned</p>
      </div>
    );
  }

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div>
      {/* Header row */}
      <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: '1fr repeat(7, 32px) 48px' }}>
        <div />
        {dayLabels.map((d) => (
          <div key={d} className="text-center text-[9px] font-medium text-stone-600 uppercase">
            {d}
          </div>
        ))}
        <div className="text-center text-[9px] font-medium text-stone-600 uppercase">%</div>
      </div>

      {/* Supplement rows */}
      <div className="space-y-1.5">
        {rows.map((row, idx) => (
          <motion.div
            key={row.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="grid gap-1 items-center"
            style={{ gridTemplateColumns: '1fr repeat(7, 32px) 48px' }}
          >
            {/* Supplement name */}
            <div className="text-xs text-stone-300 truncate pr-2" title={row.name}>
              {row.name}
            </div>

            {/* Day cells */}
            {row.days.map((status, i) => (
              <div
                key={i}
                className={`aspect-square rounded-md flex items-center justify-center transition-colors ${
                  status === 'taken'
                    ? 'bg-green-500/15 border border-green-500/25'
                    : status === 'missed'
                    ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-white/[0.02] border border-white/5'
                }`}
              >
                {status === 'taken' ? (
                  <CheckCircle2 size={12} className="text-green-400" />
                ) : status === 'missed' ? (
                  <XCircle size={10} className="text-red-400/60" />
                ) : null}
              </div>
            ))}

            {/* Compliance percentage */}
            <div className={`text-center text-xs font-semibold ${
              row.compliance >= 80
                ? 'text-green-400'
                : row.compliance >= 50
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}>
              {row.compliance}%
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

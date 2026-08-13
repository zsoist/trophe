'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pill, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '@/lib/utils/dates';

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
      const mondayStr = localDateStr(monday);

      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const sundayStr = localDateStr(sunday);

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
          const dateStr = localDateStr(d);

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
      <div className="text-center py-6 text-[var(--content-muted)] text-sm">
        Loading supplements...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-6">
        <Pill size={24} className="mx-auto text-[var(--content-muted)] mb-2" />
        <p className="text-[var(--content-muted)] text-sm">No supplement protocol assigned</p>
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
          <div key={d} className="text-center text-xs font-medium text-[var(--content-muted)] uppercase">
            {d}
          </div>
        ))}
        <div className="text-center text-xs font-medium text-[var(--content-muted)] uppercase">%</div>
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
            <div className="text-xs text-[var(--content-secondary)] truncate pr-2" title={row.name}>
              {row.name}
            </div>

            {/* Day cells */}
            {row.days.map((status, i) => (
              <div
                key={i}
                className={`aspect-square rounded-md flex items-center justify-center transition-colors ${
                  status === 'taken'
                    ? 'bg-[var(--status-success-bg)] border border-[var(--status-success-border)]'
                    : status === 'missed'
                    ? 'bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)]'
                    : 'bg-[var(--surface-2)] border border-[var(--border-default)]'
                }`}
              >
                {status === 'taken' ? (
                  <CheckCircle2 size={12} className="text-[var(--status-success-fg)]" />
                ) : status === 'missed' ? (
                  <XCircle size={10} className="text-[var(--status-danger-fg)] opacity-60" />
                ) : null}
              </div>
            ))}

            {/* Compliance percentage */}
            <div className={`text-center text-xs font-semibold ${
              row.compliance >= 80
                ? 'text-[var(--status-success-fg)]'
                : row.compliance >= 50
                ? 'text-[var(--status-warning-fg)]'
                : 'text-[var(--status-danger-fg)]'
            }`}>
              {row.compliance}%
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

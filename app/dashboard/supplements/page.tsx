'use client';
import { useRouter } from 'next/navigation';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Pill, CheckCircle2, Circle, Info } from 'lucide-react';
import { Icon } from '@/components/ui';
import { BotNav } from '@/components/ui/BotNav';
import { supabase } from '@/lib/supabase';
import type { ClientSupplement, SupplementItem, SupplementLogEntry } from '@/lib/types';
import { localToday, localDateStr } from '../../../lib/utils/dates';
import { useClientNav } from '@/lib/useClientNav';

const EVIDENCE_COLORS: Record<string, string> = {
  A: 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--status-success-border)]',
  B: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)] border-[var(--status-info-border)]',
  C: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--status-warning-border)]',
  D: 'bg-[var(--surface-2)] text-[var(--content-secondary)] border-[var(--border-default)]',
};

const EVIDENCE_LABELS: Record<string, string> = {
  A: 'Strong evidence',
  B: 'Moderate evidence',
  C: 'Limited evidence',
  D: 'Theoretical',
};

export default function SupplementsPage() {
  const clientNav = useClientNav();
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clientSupp, setClientSupp] = useState<ClientSupplement | null>(null);
  const [suppLog, setSuppLog] = useState<SupplementLogEntry[]>([]);
  const [weekLog, setWeekLog] = useState<SupplementLogEntry[]>([]);

  const today = localToday();

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      // Load active supplement protocol
      const { data: cs } = await supabase
        .from('client_supplements')
        .select('*, protocol:supplement_protocols(*)')
        .eq('user_id', user.id)
        .eq('active', true)
        .limit(1);

      if (cs && cs.length > 0) {
        setClientSupp(cs[0]);
      }

      // Load today's supplement log
      const { data: todayLog } = await supabase
        .from('supplement_log')
        .select('*')
        .eq('user_id', user.id)
        .eq('logged_date', today);

      if (todayLog) setSuppLog(todayLog);

      // Load past 7 days for compliance
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = localDateStr(weekAgo);

      const { data: weekData } = await supabase
        .from('supplement_log')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_date', weekStr)
        .eq('taken', true);

      if (weekData) setWeekLog(weekData);
    } catch (err) {
      console.error('Supplements load error:', err);
    } finally {
      setLoading(false);
    }
  }, [today, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSupplement = async (supp: SupplementItem) => {
    if (!userId) return;

    const existing = suppLog.find(
      (s) => s.supplement_name === supp.name && s.logged_date === today
    );

    if (existing) {
      // Toggle off
      await supabase.from('supplement_log').delete().eq('id', existing.id);
      setSuppLog((prev) => prev.filter((s) => s.id !== existing.id));
    } else {
      // Toggle on
      const { data } = await supabase
        .from('supplement_log')
        .insert({
          user_id: userId,
          supplement_name: supp.name,
          taken: true,
          logged_date: today,
        })
        .select()
        .maybeSingle();

      if (data) setSuppLog((prev) => [...prev, data]);
    }
  };

  const supplements: SupplementItem[] = clientSupp?.protocol?.supplements ?? [];
  const takenToday = suppLog.filter((s) => s.taken).length;
  const totalSupps = supplements.length;
  const todayPct = totalSupps > 0 ? Math.round((takenToday / totalSupps) * 100) : 0;

  // Weekly compliance: taken entries / (total supps * 7 days)
  const weeklyMax = totalSupps * 7;
  const weeklyPct = weeklyMax > 0 ? Math.round((weekLog.length / weeklyMax) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]" style={{ background: 'var(--canvas)' }}>
        <div className="max-w-md mx-auto px-4 pt-12 space-y-4">
          <div className="h-7 w-36 rounded bg-[var(--surface-2)] animate-pulse" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass p-5 space-y-3">
              <div className="h-4 w-28 rounded bg-[var(--surface-2)] animate-pulse" />
              <div className="h-3 w-48 rounded bg-[var(--surface-2)] animate-pulse" />
              <div className="space-y-2">
                <div className="h-10 w-full rounded-xl bg-[var(--surface-2)] animate-pulse" />
                <div className="h-10 w-full rounded-xl bg-[var(--surface-2)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]" style={{ background: 'var(--canvas)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md mx-auto px-4 pt-12"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Pill size={24} className="gold-text" />
          <h1 className="text-2xl font-bold text-[var(--content-primary)]">Supplements</h1>
        </div>

        {supplements.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-8 text-center"
          >
            <div className="mb-4 flex justify-center"><Icon name="i-leaf" size={40} className="text-[var(--content-muted)]" /></div>
            <h2 className="text-[var(--content-primary)] font-semibold mb-2">No Protocol Assigned</h2>
            <p className="text-[var(--content-muted)] text-sm">
              Your coach will assign a personalized supplement protocol based on your goals and needs.
            </p>
          </motion.div>
        ) : (
          <>
            {/* Compliance Stats */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass p-4 mb-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[var(--content-muted)] text-xs">Today</p>
                  <p className="text-[var(--content-primary)] text-lg font-bold">
                    {takenToday}/{totalSupps}{' '}
                    <span className="text-sm font-normal text-[var(--content-muted)]">taken</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[var(--content-muted)] text-xs">Week</p>
                  <p className="gold-text text-lg font-bold">{weeklyPct}%</p>
                </div>
              </div>
              <div className="streak-bar h-2">
                <motion.div
                  className="streak-fill h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${todayPct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </motion.div>

            {/* Protocol Name */}
            {clientSupp?.protocol?.name && (
              <p className="text-[var(--content-secondary)] text-xs font-medium uppercase tracking-wider mb-3">
                {clientSupp.protocol.name}
              </p>
            )}

            {/* Supplement List */}
            <div className="space-y-2">
              {supplements.map((supp, i) => {
                const isTaken = suppLog.some(
                  (s) => s.supplement_name === supp.name && s.taken
                );

                return (
                  <motion.div
                    key={supp.name}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    className={`glass p-4 flex items-start gap-3 cursor-pointer transition-all ${
                      isTaken ? 'gold-border' : ''
                    }`}
                    onClick={() => toggleSupplement(supp)}
                  >
                    {/* Checkbox */}
                    <div className="mt-0.5">
                      {isTaken ? (
                        <CheckCircle2 size={20} className="gold-text" />
                      ) : (
                        <Circle size={20} className="text-[var(--content-muted)]" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm font-medium ${
                            isTaken ? 'text-[var(--content-secondary)] line-through' : 'text-[var(--content-primary)]'
                          }`}
                        >
                          {supp.name}
                        </p>
                        {supp.evidence_level && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full border font-semibold ${
                              EVIDENCE_COLORS[supp.evidence_level]
                            }`}
                            title={EVIDENCE_LABELS[supp.evidence_level]}
                          >
                            {supp.evidence_level}
                          </span>
                        )}
                      </div>
                      <p className="text-[var(--content-muted)] text-xs mt-0.5">
                        {supp.dose} &middot; {supp.timing}
                      </p>
                      {supp.notes && (
                        <p className="text-[var(--content-muted)] text-xs mt-1 flex items-center gap-1">
                          <Info size={10} />
                          {supp.notes}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </motion.div>

      <BotNav routes={clientNav} />
    </div>
  );
}

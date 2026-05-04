'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, DollarSign, Zap, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface CostSummary {
  totalCost: number;
  totalCalls: number;
  byEndpoint: Record<string, { calls: number; cost: number }>;
  byDay: { date: string; cost: number; calls: number }[];
  avgCostPerCall: number;
  avgLatency: number;
  budget?: {
    monthlyBudgetUsd: number;
    projectedMonthlyCost: number;
    overBudget: boolean;
  };
}

export default function CostDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'admin' || profile?.role === 'super_admin') {
        setAuthorized(true);
      } else {
        router.push('/dashboard');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/costs?days=${period}`, {
        headers: sessionData.session?.access_token
          ? { Authorization: `Bearer ${sessionData.session.access_token}` }
          : undefined,
      });
      if (!response.ok) {
        router.push('/dashboard');
        return;
      }
      const data = await response.json() as CostSummary;
      setSummary(data);
      setLoading(false);
    };
    init();
  }, [period, router]);

  if (!authorized) return null;

  const maxDayCost = summary ? Math.max(...summary.byDay.map(d => d.cost), 0.01) : 1;
  const dailyBudget = 0.50; // $0.50/day budget line

  return (
    <div className="min-h-screen bg-stone-950">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg mx-auto px-4 pt-12 pb-24"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-stone-500 hover:text-stone-300">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-stone-100">API Cost Tracker</h1>
          <div className="ml-auto flex gap-1">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => { setPeriod(d); setLoading(true); }}
                className={`px-2.5 py-1 rounded-full text-xs ${period === d ? 'bg-[#D4A853]/20 gold-text border border-[#D4A853]/30' : 'text-stone-600 hover:text-stone-400'}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="glass p-8 text-center text-stone-500">Loading...</div>
        ) : !summary || summary.totalCalls === 0 ? (
          <div className="glass p-8 text-center text-stone-500">
            No API usage data yet. Costs will appear once users start parsing food or analyzing photos.
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="glass p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={14} className="gold-text" />
                  <span className="text-stone-500 text-xs">Total Cost</span>
                </div>
                <p className="text-2xl font-bold gold-text">${summary.totalCost.toFixed(4)}</p>
                <p className="text-[10px] text-stone-600">${(summary.totalCost / period * 30).toFixed(2)}/month projected</p>
              </div>
              <div className="glass p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={14} className="text-blue-400" />
                  <span className="text-stone-500 text-xs">API Calls</span>
                </div>
                <p className="text-2xl font-bold text-blue-400">{summary.totalCalls}</p>
                <p className="text-[10px] text-stone-600">{(summary.totalCalls / period).toFixed(1)}/day avg</p>
              </div>
              <div className="glass p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-purple-400" />
                  <span className="text-stone-500 text-xs">Avg Latency</span>
                </div>
                <p className="text-2xl font-bold text-purple-400">{Math.round(summary.avgLatency)}ms</p>
                <p className="text-[10px] text-stone-600">{(summary.avgLatency / 1000).toFixed(1)}s per call</p>
              </div>
              <div className="glass p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-green-400" />
                  <span className="text-stone-500 text-xs">Cost/Call</span>
                </div>
                <p className="text-2xl font-bold text-green-400">${summary.avgCostPerCall.toFixed(5)}</p>
                <p className="text-[10px] text-stone-600">
                  {summary.avgCostPerCall < 0.001 ? 'Very efficient' : summary.avgCostPerCall < 0.01 ? 'Normal' : 'High'}
                </p>
              </div>
            </div>

            {/* Budget Alert */}
            {(summary.totalCost / period > dailyBudget || summary.budget?.overBudget) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass p-3 mb-4 border border-red-500/20 bg-red-500/5"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-red-400 text-xs">
                    {summary.budget?.overBudget
                      ? `Projected monthly AI spend ($${summary.budget.projectedMonthlyCost.toFixed(2)}) exceeds $${summary.budget.monthlyBudgetUsd.toFixed(2)} budget`
                      : `Daily average ($${(summary.totalCost / period).toFixed(3)}) exceeds $${dailyBudget}/day budget`}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Daily Cost Chart */}
            <div className="glass p-4 mb-4">
              <h2 className="text-stone-300 text-sm font-medium mb-3">Daily Cost</h2>
              <div className="flex items-end gap-0.5 h-24">
                {summary.byDay.slice(-Math.min(period, 30)).map((day, i) => {
                  const height = Math.max(2, (day.cost / Math.max(maxDayCost, dailyBudget)) * 96);
                  const overBudget = day.cost > dailyBudget;
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center justify-end" title={`${day.date}: $${day.cost.toFixed(4)} (${day.calls} calls)`}>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height }}
                        transition={{ delay: i * 0.02 }}
                        className={`w-full rounded-t-sm ${overBudget ? 'bg-red-400' : 'bg-[#D4A853]/60'}`}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Budget line */}
              <div className="relative -mt-24 h-24 pointer-events-none">
                <div
                  className="absolute w-full border-t border-dashed border-red-500/30"
                  style={{ bottom: `${(dailyBudget / Math.max(maxDayCost, dailyBudget)) * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-stone-600 mt-1">Red dashed = ${dailyBudget}/day budget</p>
            </div>

            {/* By Endpoint */}
            <div className="glass p-4 mb-4">
              <h2 className="text-stone-300 text-sm font-medium mb-3">Cost by Endpoint</h2>
              <div className="space-y-2">
                {Object.entries(summary.byEndpoint)
                  .sort(([, a], [, b]) => b.cost - a.cost)
                  .map(([endpoint, data]) => {
                    const pct = summary.totalCost > 0 ? (data.cost / summary.totalCost) * 100 : 0;
                    return (
                      <div key={endpoint}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-stone-400 truncate">{endpoint}</span>
                          <span className="text-stone-500">${data.cost.toFixed(4)} ({data.calls})</span>
                        </div>
                        <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            className="h-full bg-[#D4A853] rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Cost Optimization Tips */}
            <div className="glass p-4">
              <h2 className="text-stone-300 text-sm font-medium mb-3">Optimization Notes</h2>
              <div className="space-y-2 text-xs text-stone-400">
                {summary.byEndpoint['/api/ai/photo-analyze'] && summary.byEndpoint['/api/food/parse'] && (
                  <p>
                    Photo analysis costs {(summary.byEndpoint['/api/ai/photo-analyze'].cost / Math.max(summary.byEndpoint['/api/food/parse'].cost, 0.0001)).toFixed(1)}x
                    more than text parsing per call. Encourage text input for lower costs.
                  </p>
                )}
                <p>
                  At current rate: ~${(summary.totalCost / period * 365).toFixed(2)}/year.
                  {summary.totalCost / period * 365 < 10 ? ' Very sustainable.' : ' Consider caching frequent queries.'}
                </p>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

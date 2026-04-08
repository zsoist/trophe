'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DataExportProps {
  userId: string;
}

export default function DataExport({ userId }: DataExportProps) {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [exported, setExported] = useState(false);

  const countRows = useCallback(async () => {
    const { count } = await supabase
      .from('food_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('logged_date', fromDate)
      .lte('logged_date', toDate);

    setRowCount(count ?? 0);
  }, [userId, fromDate, toDate]);

  const handleDateChange = useCallback(
    (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      setRowCount(null);
      setExported(false);
    },
    []
  );

  const exportCSV = useCallback(async () => {
    setLoading(true);
    setExported(false);

    try {
      const { data } = await supabase
        .from('food_log')
        .select('logged_date, meal_type, food_name, quantity, unit, calories, protein_g, carbs_g, fat_g, fiber_g, source')
        .eq('user_id', userId)
        .gte('logged_date', fromDate)
        .lte('logged_date', toDate)
        .order('logged_date', { ascending: true })
        .order('meal_type', { ascending: true });

      if (!data || data.length === 0) {
        setRowCount(0);
        return;
      }

      const headers = ['Date', 'Meal', 'Food', 'Quantity', 'Unit', 'Calories', 'Protein', 'Carbs', 'Fat', 'Fiber', 'Source'];
      const csvRows = [
        headers.join(','),
        ...data.map((row) =>
          [
            row.logged_date,
            row.meal_type ?? '',
            `"${(row.food_name ?? '').replace(/"/g, '""')}"`,
            row.quantity ?? '',
            row.unit ?? '',
            row.calories ?? '',
            row.protein_g ?? '',
            row.carbs_g ?? '',
            row.fat_g ?? '',
            row.fiber_g ?? '',
            row.source ?? '',
          ].join(',')
        ),
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `trophe-food-log-${fromDate}-to-${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setRowCount(data.length);
      setExported(true);
    } finally {
      setLoading(false);
    }
  }, [userId, fromDate, toDate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass p-5 mb-4"
    >
      <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
        <FileSpreadsheet size={14} /> Export Data
      </h3>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-stone-500 text-[10px] uppercase tracking-wider block mb-1">From</label>
          <div className="relative">
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="date"
              value={fromDate}
              onChange={handleDateChange(setFromDate)}
              max={toDate}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-2 text-xs text-stone-200 focus:outline-none focus:border-[#D4A853]/40 [color-scheme:dark]"
            />
          </div>
        </div>
        <div>
          <label className="text-stone-500 text-[10px] uppercase tracking-wider block mb-1">To</label>
          <div className="relative">
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="date"
              value={toDate}
              onChange={handleDateChange(setToDate)}
              min={fromDate}
              max={today}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-2 text-xs text-stone-200 focus:outline-none focus:border-[#D4A853]/40 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* Row count preview */}
      {rowCount !== null && (
        <p className="text-stone-400 text-xs mb-3">
          {rowCount === 0 ? 'No entries in this range' : `${rowCount} entries ready to export`}
        </p>
      )}

      {/* Export button */}
      <button
        onClick={rowCount === null ? countRows : exportCSV}
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
          exported
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-[#D4A853]/20 text-[#D4A853] border border-[#D4A853]/30 hover:bg-[#D4A853]/30'
        } disabled:opacity-50`}
      >
        {loading ? (
          <span className="animate-pulse">Exporting...</span>
        ) : exported ? (
          <>Downloaded CSV</>
        ) : rowCount === null ? (
          <>
            <FileSpreadsheet size={14} /> Preview Export
          </>
        ) : (
          <>
            <Download size={14} /> Export {rowCount} Entries as CSV
          </>
        )}
      </button>
    </motion.div>
  );
}

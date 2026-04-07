'use client';

import { motion } from 'framer-motion';
import { Check, X, MessageSquare, Scale, Flame, ArrowRight } from 'lucide-react';
import type { HabitCheckin, CoachNote, Measurement, ClientHabit, SessionType, Habit } from '@/lib/types';

const sessionLabels: Record<SessionType, string> = {
  check_in: 'Check-in',
  progression: 'Progression',
  concern: 'Concern',
  general: 'General',
};

interface TimelineItem {
  id: string;
  date: string;
  type: 'checkin' | 'note' | 'measurement' | 'habit_assign' | 'habit_complete';
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ActivityTimelineProps {
  checkins: HabitCheckin[];
  notes: CoachNote[];
  measurements: Measurement[];
  habits: (ClientHabit & { habit?: Habit })[];
}

export default function ActivityTimeline({ checkins, notes, measurements, habits }: ActivityTimelineProps) {
  const items: TimelineItem[] = [];

  // Habit check-ins
  checkins.slice(0, 14).forEach((c) => {
    items.push({
      id: `checkin-${c.id}`,
      date: c.created_at,
      type: 'checkin',
      icon: c.completed ? (
        <Check size={12} className="text-green-400" />
      ) : (
        <X size={12} className="text-red-400" />
      ),
      title: c.completed ? 'Habit completed' : 'Habit missed',
      description: c.note || formatDateShort(c.checked_date),
      badge: c.mood || undefined,
    });
  });

  // Coach notes
  notes.slice(0, 10).forEach((n) => {
    items.push({
      id: `note-${n.id}`,
      date: n.created_at,
      type: 'note',
      icon: <MessageSquare size={12} className="text-[#D4A853]" />,
      title: 'Coach note',
      description: n.note.length > 80 ? n.note.slice(0, 80) + '...' : n.note,
      badge: n.session_type ? sessionLabels[n.session_type] : undefined,
      badgeColor: n.session_type === 'concern' ? 'text-red-400 bg-red-500/10' : 'text-stone-400 bg-white/5',
    });
  });

  // Measurements
  measurements.slice(-5).forEach((m) => {
    const parts: string[] = [];
    if (m.weight_kg) parts.push(`${m.weight_kg} kg`);
    if (m.body_fat_pct) parts.push(`${m.body_fat_pct}% BF`);
    if (m.waist_cm) parts.push(`${m.waist_cm} cm waist`);
    items.push({
      id: `meas-${m.id}`,
      date: m.created_at,
      type: 'measurement',
      icon: <Scale size={12} className="text-blue-400" />,
      title: 'Measurement logged',
      description: parts.join(' | ') || formatDateShort(m.measured_date),
    });
  });

  // Habit assignments/completions
  habits.forEach((h) => {
    if (h.status === 'completed' && h.completed_at) {
      items.push({
        id: `hcomplete-${h.id}`,
        date: h.completed_at,
        type: 'habit_complete',
        icon: <Flame size={12} className="text-orange-400" />,
        title: `Completed: ${h.habit?.name_en || 'Habit'}`,
        description: `${h.total_completions} check-ins | Best streak: ${h.best_streak}`,
      });
    }
    items.push({
      id: `hassign-${h.id}`,
      date: h.started_at || h.created_at,
      type: 'habit_assign',
      icon: <ArrowRight size={12} className="text-[#D4A853]" />,
      title: `Assigned: ${h.habit?.name_en || 'Habit'}`,
      description: `${h.habit?.emoji || ''} ${h.habit?.category || ''} - ${h.habit?.difficulty || ''}`,
    });
  });

  // Sort by date descending, limit 20
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const display = items.slice(0, 20);

  if (display.length === 0) {
    return (
      <div className="text-stone-600 text-sm text-center py-6">
        No activity yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {display.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
        >
          {/* Icon */}
          <div className="w-6 h-6 rounded-full bg-white/[0.05] flex items-center justify-center flex-shrink-0 mt-0.5">
            {item.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-200">{item.title}</span>
              {item.badge && (
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${item.badgeColor || 'text-stone-400 bg-white/5'}`}>
                  {item.badge}
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-500 truncate">{item.description}</p>
          </div>

          {/* Timestamp */}
          <span className="text-[10px] text-stone-600 whitespace-nowrap flex-shrink-0">
            {formatDateShort(item.date)}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

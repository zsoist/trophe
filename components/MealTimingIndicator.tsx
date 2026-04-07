'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Coffee, Moon } from 'lucide-react';
import type { FoodLogEntry, MealType } from '@/lib/types';

interface MealTimingIndicatorProps {
  foodLog: FoodLogEntry[];
}

interface TimingWindow {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

function getTimingWindow(foodLog: FoodLogEntry[]): TimingWindow {
  const now = new Date();
  const hour = now.getHours();

  // Check for workout-related meals in the last 2 hours
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const recentWorkoutMeals = foodLog.filter((entry) => {
    const entryTime = new Date(entry.created_at);
    return (
      entryTime >= twoHoursAgo &&
      (entry.meal_type === 'pre_workout' || entry.meal_type === 'post_workout')
    );
  });

  const hasPreWorkout = recentWorkoutMeals.some((e) => e.meal_type === 'pre_workout');
  const hasPostWorkout = recentWorkoutMeals.some((e) => e.meal_type === 'post_workout');

  // Post-workout window: ate pre-workout but not post-workout yet
  if (hasPreWorkout && !hasPostWorkout) {
    return {
      label: 'Post-Workout Window',
      description: 'Eat protein + carbs within 2h for optimal recovery. Aim for 30-40g protein.',
      icon: <Zap size={16} />,
      color: '#D4A853',
      bgColor: 'rgba(212, 168, 83, 0.08)',
    };
  }

  // Recovery window: just had post-workout
  if (hasPostWorkout) {
    return {
      label: 'Recovery Phase',
      description: 'Great timing! Your muscles are absorbing nutrients. Stay hydrated.',
      icon: <Zap size={16} />,
      color: '#4ade80',
      bgColor: 'rgba(74, 222, 128, 0.08)',
    };
  }

  // Time-based general guidance
  if (hour >= 6 && hour < 10) {
    return {
      label: 'Morning Window',
      description: 'Break your fast with protein + complex carbs. Ideal: 30g protein within 1h of waking.',
      icon: <Coffee size={16} />,
      color: '#fb923c',
      bgColor: 'rgba(251, 146, 60, 0.08)',
    };
  }

  if (hour >= 10 && hour < 14) {
    return {
      label: 'Midday Fueling',
      description: 'Largest meal window. Balance protein, carbs, and fats for sustained energy.',
      icon: <Clock size={16} />,
      color: '#60a5fa',
      bgColor: 'rgba(96, 165, 250, 0.08)',
    };
  }

  if (hour >= 14 && hour < 17) {
    return {
      label: 'Afternoon Window',
      description: 'Light snack if needed. Good time for a pre-workout meal if training soon.',
      icon: <Clock size={16} />,
      color: '#a78bfa',
      bgColor: 'rgba(167, 139, 250, 0.08)',
    };
  }

  if (hour >= 17 && hour < 21) {
    return {
      label: 'Evening Window',
      description: 'Moderate dinner with protein. Avoid heavy carbs close to bedtime.',
      icon: <Moon size={16} />,
      color: '#c084fc',
      bgColor: 'rgba(192, 132, 252, 0.08)',
    };
  }

  // Late night or early morning
  return {
    label: 'Rest & Digest',
    description: 'Fasting window. If hungry, opt for casein protein or a small snack.',
    icon: <Moon size={16} />,
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.08)',
  };
}

export default function MealTimingIndicator({ foodLog }: MealTimingIndicatorProps) {
  const [timing, setTiming] = useState<TimingWindow | null>(null);

  useEffect(() => {
    setTiming(getTimingWindow(foodLog));

    // Update every minute
    const interval = setInterval(() => {
      setTiming(getTimingWindow(foodLog));
    }, 60000);

    return () => clearInterval(interval);
  }, [foodLog]);

  if (!timing) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="glass p-4 mb-4"
      style={{ borderColor: 'rgba(212, 168, 83, 0.25)', borderWidth: 1 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: timing.bgColor, color: timing.color }}
        >
          {timing.icon}
        </div>
        <div className="flex-1">
          <h3 className="text-stone-300 text-xs font-semibold uppercase tracking-wider">
            Nutrient Timing
          </h3>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            color: timing.color,
            backgroundColor: timing.bgColor,
          }}
        >
          {timing.label}
        </span>
      </div>
      <p className="text-stone-500 text-xs leading-relaxed">{timing.description}</p>
    </motion.div>
  );
}

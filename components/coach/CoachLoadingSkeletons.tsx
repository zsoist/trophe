'use client';

import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════
// τροφή — Coach Loading Skeletons (Wave 4)
// Page-specific beautiful pulse skeletons
// ═══════════════════════════════════════════════

interface CoachLoadingSkeletonsProps {
  page: 'dashboard' | 'detail' | 'habits' | 'protocols' | 'foods' | 'templates';
}

function Pulse({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div
      className={`rounded-lg ${className}`}
      style={{
        background: 'linear-gradient(90deg, rgba(120,113,108,0.08) 0%, rgba(212,168,83,0.06) 50%, rgba(120,113,108,0.08) 100%)',
        backgroundSize: '200% 100%',
        ...style,
      }}
      animate={{
        backgroundPosition: ['200% 0', '-200% 0'],
      }}
      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
    />
  );
}

function GlassBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <GlassBox key={i} className="flex flex-col items-center gap-2 py-4">
            <Pulse className="w-10 h-10 rounded-full" />
            <Pulse className="w-16 h-3" />
            <Pulse className="w-12 h-2" />
          </GlassBox>
        ))}
      </div>

      {/* Search bar */}
      <Pulse className="w-full h-12 rounded-xl" />

      {/* Client cards */}
      {[0, 1, 2, 3].map((i) => (
        <GlassBox key={i}>
          <div className="flex items-center gap-3 mb-3">
            <Pulse className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Pulse className="w-32 h-4" />
              <Pulse className="w-24 h-2" />
            </div>
            <Pulse className="w-16 h-6 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Pulse className="flex-1 h-2 rounded-full" />
            <Pulse className="w-8 h-2 rounded-full" />
          </div>
        </GlassBox>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      {/* Client header */}
      <GlassBox>
        <div className="flex items-center gap-4 mb-4">
          <Pulse className="w-14 h-14 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Pulse className="w-40 h-5" />
            <Pulse className="w-28 h-3" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="text-center space-y-1.5">
              <Pulse className="w-full h-8 rounded-lg" />
              <Pulse className="w-12 h-2 mx-auto" />
            </div>
          ))}
        </div>
      </GlassBox>

      {/* Macro donut area */}
      <GlassBox className="flex flex-col items-center">
        <Pulse className="w-36 h-36 rounded-full mb-4" />
        <div className="flex gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="text-center space-y-1">
              <Pulse className="w-8 h-2 mx-auto" />
              <Pulse className="w-12 h-3 mx-auto" />
            </div>
          ))}
        </div>
      </GlassBox>

      {/* Notes section */}
      <GlassBox>
        <Pulse className="w-24 h-4 mb-3" />
        <div className="space-y-2">
          <Pulse className="w-full h-3" />
          <Pulse className="w-4/5 h-3" />
          <Pulse className="w-3/5 h-3" />
        </div>
      </GlassBox>
    </div>
  );
}

function HabitsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header + add button */}
      <div className="flex justify-between items-center">
        <Pulse className="w-32 h-6" />
        <Pulse className="w-24 h-9 rounded-lg" />
      </div>

      {/* Habit cards */}
      {[0, 1, 2, 3, 4].map((i) => (
        <GlassBox key={i}>
          <div className="flex items-center gap-3">
            <Pulse className="w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Pulse className="w-36 h-4" />
              <Pulse className="w-24 h-2" />
            </div>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <Pulse key={d} className="w-5 h-5 rounded-full" />
              ))}
            </div>
          </div>
        </GlassBox>
      ))}
    </div>
  );
}

function ProtocolsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Pulse className="w-28 h-6" />
        <Pulse className="w-20 h-9 rounded-lg" />
      </div>

      {/* Protocol cards */}
      {[0, 1, 2].map((i) => (
        <GlassBox key={i}>
          <div className="flex items-start gap-3 mb-3">
            <Pulse className="w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Pulse className="w-40 h-4" />
              <Pulse className="w-full h-2" />
              <Pulse className="w-3/4 h-2" />
            </div>
          </div>
          <div className="flex gap-2">
            <Pulse className="w-16 h-6 rounded-full" />
            <Pulse className="w-20 h-6 rounded-full" />
          </div>
        </GlassBox>
      ))}
    </div>
  );
}

function FoodsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Search */}
      <Pulse className="w-full h-12 rounded-xl" />

      {/* Category tabs */}
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Pulse key={i} className="w-20 h-8 rounded-full" />
        ))}
      </div>

      {/* Food items */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
        >
          <Pulse className="w-10 h-10 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Pulse className="w-32 h-3" />
            <Pulse className="w-20 h-2" />
          </div>
          <div className="text-right space-y-1">
            <Pulse className="w-12 h-3" />
            <Pulse className="w-16 h-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplatesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Pulse className="w-32 h-6" />
        <Pulse className="w-28 h-9 rounded-lg" />
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <GlassBox key={i} className="py-6">
            <div className="flex flex-col items-center gap-2">
              <Pulse className="w-12 h-12 rounded-xl" />
              <Pulse className="w-24 h-4" />
              <Pulse className="w-16 h-2" />
              <div className="flex gap-1 mt-2">
                <Pulse className="w-10 h-4 rounded-full" />
                <Pulse className="w-14 h-4 rounded-full" />
              </div>
            </div>
          </GlassBox>
        ))}
      </div>
    </div>
  );
}

const SKELETON_MAP = {
  dashboard: DashboardSkeleton,
  detail: DetailSkeleton,
  habits: HabitsSkeleton,
  protocols: ProtocolsSkeleton,
  foods: FoodsSkeleton,
  templates: TemplatesSkeleton,
};

export default function CoachLoadingSkeletons({ page }: CoachLoadingSkeletonsProps) {
  const SkeletonComponent = SKELETON_MAP[page];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-[400px]"
    >
      <SkeletonComponent />
    </motion.div>
  );
}

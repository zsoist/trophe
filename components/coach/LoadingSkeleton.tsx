'use client';

import { memo, type JSX } from 'react';

type SkeletonVariant = 'clients' | 'habits' | 'protocols' | 'detail';

interface LoadingSkeletonProps {
  variant: SkeletonVariant;
}

function Pulse({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gradient-to-r from-stone-800/60 via-stone-700/40 to-stone-800/60 ${className}`}
      style={{
        backgroundSize: '200% 100%',
        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }}
    />
  );
}

function ClientsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Pulse cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 flex flex-col items-center gap-2">
            <Pulse className="w-9 h-9 rounded-lg" />
            <Pulse className="w-12 h-5" />
            <Pulse className="w-16 h-2" />
          </div>
        ))}
      </div>

      {/* Search bar */}
      <Pulse className="w-full h-11 rounded-xl" />

      {/* Client cards */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Pulse className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Pulse className="w-28 h-3.5" />
              <Pulse className="w-20 h-2" />
            </div>
            <Pulse className="w-14 h-6 rounded-full" />
          </div>
          <Pulse className="w-full h-2 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function HabitsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Pulse className="w-32 h-5" />
        <Pulse className="w-20 h-8 rounded-lg" />
      </div>

      {/* Habit cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <Pulse className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Pulse className="w-24 h-3.5" />
                <Pulse className="w-16 h-2" />
              </div>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <Pulse key={d} className="w-6 h-6 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProtocolsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Pulse key={i} className="w-20 h-8 rounded-lg" />
        ))}
      </div>

      {/* Protocol cards */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-2">
              <Pulse className="w-36 h-4" />
              <Pulse className="w-24 h-2" />
            </div>
            <Pulse className="w-8 h-8 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Pulse className="w-full h-2 rounded-full" />
            <Pulse className="w-3/4 h-2 rounded-full" />
          </div>
          <div className="flex gap-2 mt-4">
            <Pulse className="w-16 h-5 rounded-full" />
            <Pulse className="w-16 h-5 rounded-full" />
            <Pulse className="w-16 h-5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      {/* Profile header */}
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center gap-4 mb-4">
          <Pulse className="w-14 h-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Pulse className="w-40 h-5" />
            <Pulse className="w-24 h-2.5" />
            <Pulse className="w-32 h-2" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="text-center space-y-1">
              <Pulse className="w-10 h-4 mx-auto" />
              <Pulse className="w-14 h-2 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Macro chart placeholder */}
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 flex items-center justify-center">
        <Pulse className="w-40 h-40 rounded-full" />
      </div>

      {/* Activity feed placeholder */}
      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 space-y-3">
        <Pulse className="w-24 h-3" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Pulse className="w-8 h-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Pulse className="w-3/4 h-2.5" />
              <Pulse className="w-1/2 h-2" />
            </div>
            <Pulse className="w-10 h-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

const VARIANT_MAP: Record<SkeletonVariant, () => JSX.Element> = {
  clients: ClientsSkeleton,
  habits: HabitsSkeleton,
  protocols: ProtocolsSkeleton,
  detail: DetailSkeleton,
};

export default memo(function LoadingSkeleton({ variant }: LoadingSkeletonProps) {
  const Component = VARIANT_MAP[variant];
  return (
    <div className="min-h-[400px]">
      <Component />
    </div>
  );
});

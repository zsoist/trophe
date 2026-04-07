'use client';

// ═══════════════════════════════════════════════
// τροφή (Trophē) — Loading Skeleton System
// Gold shimmer on dark background
// ═══════════════════════════════════════════════

function shimmerClass() {
  return 'animate-pulse bg-gradient-to-r from-stone-800/60 via-stone-700/40 to-stone-800/60 bg-[length:200%_100%]';
}

// ─── SkeletonText ───
export function SkeletonText({
  variant = 'medium',
  className = '',
}: {
  variant?: 'short' | 'medium' | 'long';
  className?: string;
}) {
  const widths = { short: 'w-16', medium: 'w-32', long: 'w-48' };
  return (
    <div
      className={`h-3 rounded-md ${shimmerClass()} ${widths[variant]} ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(120,113,108,0.1) 0%, rgba(212,168,83,0.08) 50%, rgba(120,113,108,0.1) 100%)',
      }}
    />
  );
}

// ─── SkeletonBar ───
export function SkeletonBar({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-3 w-full rounded-full ${shimmerClass()} ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(120,113,108,0.1) 0%, rgba(212,168,83,0.08) 50%, rgba(120,113,108,0.1) 100%)',
      }}
    />
  );
}

// ─── SkeletonRing ───
export function SkeletonRing({
  size = 80,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const radius = (size - 8) / 2;
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={6}
            className="animate-pulse"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(212,168,83,0.1)"
            strokeWidth={6}
            strokeDasharray={`${2 * Math.PI * radius * 0.3} ${2 * Math.PI * radius * 0.7}`}
            className="animate-pulse"
          />
        </svg>
      </div>
      <SkeletonText variant="short" />
      <SkeletonText variant="short" className="h-2" />
    </div>
  );
}

// ─── SkeletonCard ───
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`glass p-5 ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(26,26,26,0.7) 0%, rgba(212,168,83,0.02) 50%, rgba(26,26,26,0.7) 100%)',
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full ${shimmerClass()}`} />
        <div className="flex-1 space-y-2">
          <SkeletonText variant="medium" />
          <SkeletonText variant="short" className="h-2" />
        </div>
      </div>
      <SkeletonBar className="mb-3" />
      <div className="flex gap-3">
        <div className={`flex-1 h-10 rounded-xl ${shimmerClass()}`} />
        <div className={`flex-1 h-10 rounded-xl ${shimmerClass()}`} />
      </div>
    </div>
  );
}

// ─── DashboardSkeleton ───
// Full-page skeleton for the dashboard loading state
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-stone-950 pb-24">
      <div className="max-w-md mx-auto px-4 pt-12">
        {/* Greeting skeleton */}
        <div className="mb-6 space-y-2">
          <SkeletonText variant="long" className="h-6" />
          <SkeletonText variant="medium" className="h-3" />
          <SkeletonText variant="short" className="h-2" />
        </div>

        {/* Active Habit Card skeleton */}
        <div className="glass gold-border p-5 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-lg ${shimmerClass()}`} />
            <div className="flex-1 space-y-2">
              <SkeletonText variant="medium" />
              <SkeletonText variant="short" className="h-2" />
            </div>
            <SkeletonText variant="short" />
          </div>
          <SkeletonBar className="mb-4 h-3" />
          <div className="flex gap-3">
            <div className={`flex-1 h-10 rounded-xl ${shimmerClass()}`} />
            <div className={`flex-1 h-10 rounded-xl ${shimmerClass()}`} />
          </div>
        </div>

        {/* Macro Rings skeleton */}
        <div className="glass p-5 mb-4">
          <SkeletonText variant="medium" className="mb-4 h-3" />
          <div className="flex items-center justify-around">
            <SkeletonRing size={80} />
            <SkeletonRing size={80} />
            <SkeletonRing size={80} />
            <SkeletonRing size={80} />
          </div>
        </div>

        {/* Water tracker skeleton */}
        <div className="glass p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <SkeletonText variant="short" />
            <SkeletonText variant="medium" />
          </div>
          <SkeletonBar className="mb-3 h-4" />
          <div className={`h-10 rounded-xl ${shimmerClass()}`} />
        </div>
      </div>
    </div>
  );
}

// ─── CoachSkeleton ───
// Full-page skeleton for coach dashboard
export function CoachSkeleton() {
  return (
    <div className="min-h-screen bg-stone-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Nav skeleton */}
        <div className={`glass mb-8 h-12 ${shimmerClass()}`} />

        {/* Header skeleton */}
        <div className="mb-8 space-y-2">
          <SkeletonText variant="long" className="h-7" />
          <SkeletonText variant="medium" className="h-3" />
        </div>

        {/* Summary bar skeleton */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass p-4 flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded ${shimmerClass()}`} />
              <SkeletonText variant="short" className="h-2" />
            </div>
          ))}
        </div>

        {/* Search skeleton */}
        <div className={`h-12 rounded-xl mb-6 ${shimmerClass()}`} />

        {/* Client cards skeleton */}
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

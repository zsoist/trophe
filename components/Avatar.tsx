'use client';

// ═══════════════════════════════════════════════
// τροφή (Trophē) — Initials Avatar
// Colored circle with hash-based color
// ═══════════════════════════════════════════════

const AVATAR_COLORS = [
  { bg: 'rgba(212,168,83,0.2)', text: '#D4A853' },   // gold
  { bg: 'rgba(59,130,246,0.2)', text: '#60a5fa' },    // blue
  { bg: 'rgba(34,197,94,0.2)', text: '#4ade80' },     // green
  { bg: 'rgba(168,85,247,0.2)', text: '#c084fc' },    // purple
  { bg: 'rgba(244,63,94,0.2)', text: '#fb7185' },     // rose
  { bg: 'rgba(245,158,11,0.2)', text: '#fbbf24' },    // amber
  { bg: 'rgba(20,184,166,0.2)', text: '#2dd4bf' },    // teal
  { bg: 'rgba(99,102,241,0.2)', text: '#a5b4fc' },    // indigo
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  size = 32,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  const initials = getInitials(name);
  const fontSize = size <= 32 ? 11 : size <= 48 ? 14 : 18;

  return (
    <div
      className={`flex items-center justify-center rounded-full flex-shrink-0 font-semibold select-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color.bg,
        color: color.text,
        fontSize,
        border: `1px solid ${color.text}33`,
      }}
    >
      {initials}
    </div>
  );
}

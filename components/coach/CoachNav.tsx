'use client';

import Link from 'next/link';
import {
  Users,
  Calendar,
  MessageSquare,
  Dumbbell,
  Pill,
  UtensilsCrossed,
  LayoutGrid,
} from 'lucide-react';

export const coachNav = [
  { label: 'Clients', href: '/coach', icon: Users },
  { label: 'Calendar', href: '/coach/calendar', icon: Calendar },
  { label: 'Inbox', href: '/coach/inbox', icon: MessageSquare },
  { label: 'Habits', href: '/coach/habits', icon: Dumbbell },
  { label: 'Protocols', href: '/coach/protocols', icon: Pill },
  { label: 'Foods', href: '/coach/foods', icon: UtensilsCrossed },
  { label: 'Templates', href: '/coach/templates', icon: LayoutGrid },
];

export function CoachNav({ active }: { active: string }) {
  return (
    <nav className="flex gap-1 p-1 rounded-2xl glass mb-8 overflow-x-auto">
      {coachNav.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-[#D4A853]/15 text-[#D4A853]'
                : 'text-stone-400 hover:text-stone-200 hover:bg-white/5'
            }`}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

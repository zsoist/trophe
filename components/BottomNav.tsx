'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, Dumbbell, Pill, BarChart3, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';

const NAV_ITEMS = [
  { href: '/dashboard', labelKey: 'nav.home', icon: Home },
  { href: '/dashboard/log', labelKey: 'nav.track', icon: UtensilsCrossed },
  { href: '/dashboard/workout', labelKey: 'nav.workout', icon: Dumbbell },
  { href: '/dashboard/supplements', labelKey: 'nav.supplements', icon: Pill },
  { href: '/dashboard/progress', labelKey: 'nav.progress', icon: BarChart3 },
  { href: '/dashboard/profile', labelKey: 'nav.profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-elevated safe-bottom">
      <div className="max-w-md mx-auto flex items-center justify-around px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'rgba(212, 168, 83, 0.1)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon
                size={22}
                className={isActive ? 'gold-text' : 'text-stone-500'}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                className={`text-[11px] font-medium ${
                  isActive ? 'gold-text' : 'text-stone-500'
                }`}
              >
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

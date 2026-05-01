'use client';
// ─── Shared dashboard BotNav routes — translated ───────────────
// Import this hook in any dashboard page instead of defining routes inline.

import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/ui';

export function useClientNav() {
  const { t } = useI18n();
  return [
    { href: '/dashboard',          label: t('nav.home'),     icon: <Icon name="i-home"  size={18} /> },
    { href: '/dashboard/log',      label: t('nav.log'),      icon: <Icon name="i-book"  size={18} /> },
    { href: '/dashboard/progress', label: t('nav.progress'), icon: <Icon name="i-chart" size={18} /> },
    { href: '/dashboard/profile',  label: t('nav.me'),       icon: <Icon name="i-user"  size={18} /> },
  ];
}

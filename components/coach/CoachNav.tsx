'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Calendar,
  MessageSquare,
  Dumbbell,
  Pill,
  UtensilsCrossed,
  LayoutGrid,
  ClipboardList,
  MoreHorizontal,
  ArrowLeftRight,
} from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export const coachNav = [
  { label: 'Clients', href: '/coach', icon: Users },
  { label: 'Calendar', href: '/coach/calendar', icon: Calendar },
  { label: 'Inbox', href: '/coach/inbox', icon: MessageSquare },
  { label: 'Habits', href: '/coach/habits', icon: Dumbbell },
  { label: 'Protocols', href: '/coach/protocols', icon: Pill },
  { label: 'Foods', href: '/coach/foods', icon: UtensilsCrossed },
  { label: 'Templates', href: '/coach/templates', icon: LayoutGrid },
  { label: 'Intake', href: '/coach/questionnaires', icon: ClipboardList },
];

export function CoachNav({ active }: { active: string }) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const disclosureRef = useRef<HTMLDivElement>(null);
  const primary = coachNav.slice(0, 4);
  const secondary = coachNav.slice(4);

  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        disclosureRef.current?.querySelector('button')?.focus();
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (!disclosureRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [moreOpen]);

  const navLinkClass = (href: string) => [
    'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors motion-reduce:transition-none',
    active === href
      ? 'bg-[var(--surface-active)] text-[var(--action-primary)]'
      : 'text-[var(--content-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--content-primary)]',
  ].join(' ');

  const renderLink = (item: (typeof coachNav)[number]) => {
    const ItemIcon = item.icon;
    return (
      <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
        <ItemIcon size={16} aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Coach destinations"
      className="mb-8 flex flex-wrap items-center gap-1 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-1)] p-1 shadow-[var(--shadow-low)]"
    >
      {primary.map(renderLink)}
      <div className="hidden flex-wrap items-center gap-1 md:flex">
        {secondary.map(renderLink)}
      </div>
      {/* Dedicated coach⇄client switcher — coaches who are also clients (Nik,
          Michael) flip to their own client dashboard; BotNav there links back. */}
      <Link
        href="/dashboard"
        className="ml-auto flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors motion-reduce:transition-none text-[var(--action-primary)] border border-[color-mix(in_srgb,var(--action-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--action-primary)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--action-primary)_16%,transparent)]"
      >
        <ArrowLeftRight size={15} aria-hidden="true" />
        {t('nav.switch_client')}
      </Link>
      <div ref={disclosureRef} className="relative md:hidden">
        <IconButton
          aria-label="More coach destinations"
          aria-expanded={moreOpen}
          aria-controls="coach-more-destinations"
          onClick={() => setMoreOpen((open) => !open)}
          className={moreOpen ? 'bg-[var(--surface-active)] text-[var(--action-primary)]' : ''}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </IconButton>
        {moreOpen ? (
          <div
            id="coach-more-destinations"
            role="group"
            aria-label="More coach destinations"
            className="absolute right-0 top-full z-[var(--z-dropdown,40)] mt-2 grid min-w-48 gap-1 rounded-xl border border-[var(--border-default)] bg-[var(--surface-overlay)] p-1 shadow-[var(--shadow-high)]"
          >
            {secondary.map((item) => {
              const ItemIcon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(item.href)}
                  onClick={() => setMoreOpen(false)}
                >
                  <ItemIcon size={16} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </nav>
  );
}

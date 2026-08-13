import Link from 'next/link';
import {
  LANDING_LANGUAGE_ROUTES,
  type LandingLang,
} from '@/lib/landing-language';

export default function LanguageLinks({ current }: { current: LandingLang }) {
  return (
    <nav
      aria-label="Language"
      className="flex gap-0.5 bg-[var(--surface-2)] rounded-full p-0.5 border border-[var(--border-default)]"
    >
      {(Object.keys(LANDING_LANGUAGE_ROUTES) as LandingLang[]).map((code) => (
        <Link
          key={code}
          href={LANDING_LANGUAGE_ROUTES[code]}
          prefetch={false}
          aria-current={current === code ? 'page' : undefined}
          className={`px-2 py-1 rounded-full text-xs font-medium uppercase transition-all no-underline ${
            current === code
              ? 'bg-[#D4A853]/15 text-[#D4A853]'
              : 'text-[var(--content-muted)] hover:text-[var(--content-muted)]'
          }`}
        >
          {code}
        </Link>
      ))}
    </nav>
  );
}

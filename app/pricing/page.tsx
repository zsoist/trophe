/**
 * Public Pricing page — marketing/transparency only.
 * No billing or Stripe wired up yet; Pro/Clinic CTAs go to mailto.
 * Prices are launch pricing, validated with beta cohort before enforcing.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeModeProvider, ThemeModeToggle } from '@/components/shared/ThemeMode';

export const metadata: Metadata = {
  title: 'Pricing — trophē',
  description:
    'Simple, transparent pricing for nutrition coaches and clinics. Coach Free forever, Coach Pro €29/mo, Clinic €99/mo per location. Launch pricing — validated with beta cohort.',
};

const GOLD = 'var(--action-primary)';
const BG = 'var(--canvas)';

/* ─── Tier data ─── */
const tiers = [
  {
    id: 'free',
    name: 'Coach Free',
    price: '€0',
    period: 'forever',
    tagline: 'A solo nutritionist running a real practice, at no cost.',
    highlight: false,
    badge: null,
    features: [
      'Up to 5 active clients',
      'Food logging + AI analysis',
      'Meal plans & macro targets',
      'Intake questionnaire (default set)',
      'Client messaging',
      'Basic coach dashboard',
      '"Powered by trophē" in client app',
    ],
    missing: [
      'Unlimited clients',
      'Retention & business KPIs',
      'Booking with paid consults',
      'Custom intake questions',
      'AI coach insight',
      'Branded client experience',
      'Signable DPA',
    ],
    cta: 'Start free',
    ctaHref: '/login?mode=signup',
    ctaStyle: 'outline' as const,
  },
  {
    id: 'pro',
    name: 'Coach Pro',
    price: '€29',
    period: '/mo',
    yearlyNote: '€290/yr — save two months',
    tagline: 'The workhorse for established solo coaches with 30–80 clients.',
    highlight: true,
    badge: 'Most popular',
    features: [
      'Unlimited clients',
      'Business KPIs + contact-due engine',
      'Booking calendar with paid consults',
      '8% in-app commission on booked consults (we handle payouts)',
      'Custom intake questions & daily check-ins',
      'AI coach insight (monthly token allowance)',
      'Branded client experience — logo & colours',
      'Signable Data Processing Agreement (DPA)',
      'Full data export',
    ],
    missing: [],
    cta: 'Get in touch',
    ctaHref: 'mailto:hello@trophe.app?subject=Coach%20Pro%20interest',
    ctaStyle: 'gold' as const,
  },
  {
    id: 'clinic',
    name: 'Clinic',
    price: '€99',
    period: '/mo per location',
    yearlyNote: null,
    tagline: 'Multi-coach practices and clinics that need org-level control.',
    highlight: false,
    badge: null,
    features: [
      'Everything in Coach Pro',
      'Up to 8 coach seats included',
      '€12/seat beyond 8',
      'Org-level dashboard — per-coach KPIs',
      'Client transfer between coaches',
      'Org AI budget controls',
      'Priority support',
      'DPO walkthrough included',
      'Security questionnaire support',
    ],
    missing: [],
    cta: 'Contact us',
    ctaHref: 'mailto:hello@trophe.app?subject=Clinic%20plan%20enquiry',
    ctaStyle: 'outline' as const,
  },
];

/* ─── Check / Cross icons ─── */
function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="7" cy="7" r="7" fill="var(--surface-active)" />
      <path d="M4 7l2 2 4-4" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="7" cy="7" r="7" fill="var(--surface-2)" />
      <path d="M5 5l4 4M9 5l-4 4" stroke="var(--content-muted)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Tier card ─── */
function TierCard({ tier }: { tier: (typeof tiers)[number] }) {
  const isGold = tier.highlight;

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 20,
        padding: '2px',
        background: isGold
          ? 'linear-gradient(135deg, var(--border-focus) 0%, var(--border-default) 50%, transparent 100%)'
          : 'var(--border-default)',
        flex: '1 1 280px',
        maxWidth: 360,
      }}
    >
      {/* Badge */}
      {tier.badge && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: GOLD,
            color: 'var(--action-on-primary)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '4px 12px',
            borderRadius: 20,
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
          }}
        >
          {tier.badge}
        </div>
      )}

      {/* Inner card */}
      <div
        style={{
          borderRadius: 18,
          background: isGold ? 'var(--surface-2)' : 'var(--surface-1)',
          padding: '28px 24px 32px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Tier name */}
        <p
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: isGold ? GOLD : 'var(--content-muted)',
            marginBottom: 10,
          }}
        >
          {tier.name}
        </p>

        {/* Price */}
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--content-primary)', lineHeight: 1 }}>
            {tier.price}
          </span>
          <span style={{ fontSize: 14, color: 'var(--content-muted)', marginLeft: 4 }}>{tier.period}</span>
        </div>

        {/* Yearly note */}
        {tier.yearlyNote && (
          <p style={{ fontSize: 12, color: GOLD, marginBottom: 10, fontFamily: 'monospace' }}>
            {tier.yearlyNote}
          </p>
        )}

        {/* Tagline */}
        <p style={{ fontSize: 14, color: 'var(--content-muted)', lineHeight: 1.6, marginBottom: 24 }}>
          {tier.tagline}
        </p>

        {/* CTA */}
        <a
          href={tier.ctaHref}
          {...(tier.ctaHref.startsWith('mailto:') ? {} : {})}
          style={{
            display: 'flex',
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '12px 20px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            marginBottom: 24,
            transition: 'opacity 0.15s',
            ...(tier.ctaStyle === 'gold'
              ? {
                  background: GOLD,
                  color: 'var(--action-on-primary)',
                }
              : {
                  background: 'transparent',
                  border: `1px solid ${isGold ? 'var(--border-focus)' : 'var(--border-default)'}`,
                  color: isGold ? GOLD : 'var(--content-secondary)',
                }),
          }}
        >
          {tier.cta}
        </a>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />

        {/* Features */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {tier.features.map((f) => (
            <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: 'var(--content-secondary)', lineHeight: 1.5 }}>
              <Check />
              {f}
            </li>
          ))}
          {tier.missing.map((f) => (
            <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: 'var(--content-muted)', lineHeight: 1.5 }}>
              <Cross />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function PricingPage() {
  return (
    <ThemeModeProvider>
    <main style={{ background: BG, minHeight: '100vh', color: 'var(--content-primary)' }}>
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 800,
          height: 500,
          borderRadius: '50%',
          background: GOLD,
          opacity: 0.025,
          filter: 'blur(160px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '72px 24px 96px', position: 'relative' }}>

        {/* ─── Back nav ─── */}
        <div style={{ marginBottom: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link
            href="/"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 12, fontFamily: 'monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--content-muted)', textDecoration: 'none' }}
          >
            ← trophē
          </Link>
          <ThemeModeToggle />
        </div>

        {/* ─── Header ─── */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: GOLD,
              marginBottom: 16,
            }}
          >
            Pricing
          </p>
          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              marginBottom: 16,
              color: 'var(--content-primary)',
            }}
          >
            Charge the coach,{' '}
            <span style={{ color: GOLD, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>not the client.</span>
          </h1>
          <p
            style={{
              maxWidth: 520,
              margin: '0 auto',
              fontSize: 15,
              color: 'var(--content-muted)',
              lineHeight: 1.7,
            }}
          >
            The client app is always free — it&rsquo;s your retention tool, not our revenue line.
            You pay for the coaching platform that makes you more effective.
          </p>

          {/* Launch pricing banner */}
          <div
            style={{
              display: 'inline-block',
              marginTop: 20,
              padding: '8px 16px',
              borderRadius: 999,
              border: '1px solid var(--border-focus)',
              background: 'var(--surface-2)',
              fontSize: 12,
              color: 'var(--content-muted)',
              fontFamily: 'monospace',
            }}
          >
            Launch pricing — validating with our beta cohort before locking in
          </div>
        </div>

        {/* ─── Tier cards ─── */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            justifyContent: 'center',
            alignItems: 'stretch',
            marginBottom: 56,
          }}
        >
          {tiers.map((tier) => (
            <TierCard key={tier.id} tier={tier} />
          ))}
        </div>

        {/* ─── Commission note ─── */}
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto 56px',
            padding: '20px 24px',
            borderRadius: 14,
            border: '1px solid var(--border-default)',
            background: 'var(--surface-1)',
            fontSize: 14,
            color: 'var(--content-muted)',
            lineHeight: 1.7,
            textAlign: 'center',
          }}
        >
          <span style={{ color: 'var(--content-secondary)', fontWeight: 600 }}>Booking commission.</span>{' '}
          Pro and Clinic coaches keep 92% of every consult paid through trophē — we take 8% and handle payouts.
          Free coaches pay 12% (incentive to upgrade). You set the price; your client pays in-app.
        </div>

        {/* ─── FAQ strip ─── */}
        <div style={{ maxWidth: 640, margin: '0 auto 56px' }}>
          {[
            [
              'No paywall until beta validation?',
              'Correct. No feature gating ships until Michael\'s beta cohort gives us pricing feedback. These numbers are our working hypothesis — your early feedback shapes the final tiers.',
            ],
            [
              'What counts as an "active client"?',
              'Any client who has logged food, received a plan, or had a coaching interaction in the last 30 days. Inactive clients don\'t count against your limit.',
            ],
            [
              'Can I trial Pro features?',
              'Yes — email hello@trophe.app and we\'ll open Pro access for your beta period at no charge. We want real-world feedback before billing.',
            ],
            [
              'Annual discount?',
              'Coach Pro is €290/yr (billed annually) — equivalent to 10 months, saving you 2. Clinic annual pricing on request.',
            ],
          ].map(([q, a]) => (
            <div
              key={q as string}
              style={{
                borderTop: '1px solid var(--border-subtle)',
                padding: '20px 0',
              }}
            >
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--content-secondary)', marginBottom: 8 }}>{q}</p>
              <p style={{ fontSize: 14, color: 'var(--content-muted)', lineHeight: 1.7 }}>{a}</p>
            </div>
          ))}
        </div>

        {/* ─── Footer notes ─── */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--content-muted)', fontFamily: 'monospace' }}>
            Prices shown exclude VAT &mdash; EU VAT (where applicable) added at checkout.
          </p>
          <p style={{ fontSize: 12, color: 'var(--content-muted)' }}>
            Questions about GDPR, data processing agreements, or hosting?{' '}
            <Link href="/trust" style={{ color: GOLD, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              Read our Trust &amp; Data Protection page →
            </Link>
          </p>
          <p style={{ fontSize: 12, color: 'var(--content-muted)' }}>
            <a href="mailto:hello@trophe.app" style={{ color: 'var(--content-muted)', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              hello@trophe.app
            </a>
            {' '}&middot;{' '}
            <a href="mailto:dpo@trophe.app" style={{ color: 'var(--content-muted)', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
              dpo@trophe.app
            </a>
          </p>
        </div>
      </div>
    </main>
    </ThemeModeProvider>
  );
}

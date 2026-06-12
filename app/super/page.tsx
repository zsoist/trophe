'use client';

/**
 * Super Command Center — super_admin only.
 * One screen overseeing the entire platform: people, live activity, AI spend,
 * data health, ops failures — plus one-tap entry into the coach and client
 * experiences for end-to-end feature testing.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface Overview {
  generatedAt: string;
  people: Array<{ role: string; n: number }>;
  activity: {
    logs_today?: number; logs_7d?: number; active_clients_7d?: number;
    messages_7d?: number; checkins_7d?: number; appts_upcoming?: number;
    workouts_7d?: number; prs_7d?: number;
  };
  aiCosts: Array<{ window: string; cost: number; tokens_in: number; tokens_out: number; runs: number }>;
  aiByTask: Array<{ task: string; cost: number; runs: number }>;
  aiErrors: { errors_24h?: number; runs_24h?: number };
  foods: Array<{ source: string; n: number; embedded: number }>;
  recentSignups: Array<{ full_name: string; role: string; created_at: string }>;
  recentFailures: Array<{ task: string; status: string; error: string | null; created_at: string }>;
}

const GOLD = 'var(--gold-300,#D4A853)';

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div className="row-b" style={{ marginBottom: 10 }}>
        <span className="eye">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function SuperCommandCenter() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/super/overview');
    if (!res.ok) { setError(`${res.status} — super_admin required`); return; }
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // live refresh every minute
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return <div className="min-h-screen flex items-center justify-center ds-sub" style={{ background: 'var(--bg,#0a0a0a)' }}>{error}</div>;
  }

  const cost = (w: string) => data?.aiCosts.find((c) => c.window === w);
  const errRate = data?.aiErrors.runs_24h
    ? Math.round(((data.aiErrors.errors_24h ?? 0) / data.aiErrors.runs_24h) * 100)
    : 0;
  const totalFoods = data?.foods.reduce((s, f) => s + f.n, 0) ?? 0;
  const totalEmbedded = data?.foods.reduce((s, f) => s + f.embedded, 0) ?? 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg,#0a0a0a)', paddingBottom: 40 }}>
      <motion.div
        className="max-w-md lg:max-w-5xl mx-auto px-4 pt-4"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="row-b" style={{ marginBottom: 4 }}>
          <div>
            <div className="eye" style={{ color: GOLD }}>SUPER COMMAND CENTER</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--t1)' }}>
              Everything, one screen
            </div>
          </div>
          <span className="ds-sub" style={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}>
            {data ? `refreshed ${new Date(data.generatedAt).toLocaleTimeString()}` : 'loading…'}
          </span>
        </div>

        {/* View-as switcher: test every side of the product */}
        <div style={{ display: 'flex', gap: 8, margin: '12px 0 18px' }}>
          {[
            ['/coach', '🧑‍🏫 Coach view'],
            ['/dashboard', '🙋 Client view'],
            ['/admin/costs', '💳 Costs admin'],
            ['/admin/orgs', '🏢 Orgs admin'],
          ].map(([href, label]) => (
            <Link key={href} href={href} style={{
              flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: 12,
              border: `1px solid rgba(212,168,83,.3)`, background: 'rgba(212,168,83,.07)',
              color: GOLD, fontSize: 11, fontWeight: 700, textDecoration: 'none',
            }}>
              {label}
            </Link>
          ))}
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:gap-4">
          <div>
            {/* People */}
            <Section title="PEOPLE">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(data?.people ?? []).map((p) => (
                  <div key={p.role} style={{ flex: 1, minWidth: 90, textAlign: 'center', padding: '10px 6px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>{p.n}</div>
                    <div className="ds-sub" style={{ fontSize: 9, textTransform: 'uppercase' }}>{p.role}s</div>
                  </div>
                ))}
              </div>
              <div className="ds-sub" style={{ fontSize: 10, marginTop: 10 }}>
                Latest signups: {(data?.recentSignups ?? []).slice(0, 4).map((s) => `${s.full_name} (${s.role})`).join(' · ') || '—'}
              </div>
            </Section>

            {/* Live activity */}
            <Section title="ACTIVITY">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  ['Logs today', data?.activity.logs_today],
                  ['Logs · 7d', data?.activity.logs_7d],
                  ['Active clients · 7d', data?.activity.active_clients_7d],
                  ['Messages · 7d', data?.activity.messages_7d],
                  ['Check-ins · 7d', data?.activity.checkins_7d],
                  ['Appts upcoming', data?.activity.appts_upcoming],
                  ['Workouts · 7d', data?.activity.workouts_7d],
                  ['PRs hit · 7d', data?.activity.prs_7d],
                ].map(([label, v]) => (
                  <div key={label as string} style={{ padding: '10px 8px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>{v ?? '—'}</div>
                    <div className="ds-sub" style={{ fontSize: 9 }}>{label}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Data health */}
            <Section title={`FOOD DATABASE · ${totalFoods.toLocaleString()} foods`}>
              <div className="ds-sub" style={{ fontSize: 10, marginBottom: 8 }}>
                Embedding coverage {totalFoods ? Math.round((totalEmbedded / totalFoods) * 100) : 0}%
              </div>
              {(data?.foods ?? []).map((f) => (
                <div key={f.source} className="row-b" style={{ marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--font-mono)' }}>{f.source}</span>
                  <div className="row-i" style={{ gap: 8 }}>
                    <div style={{ width: 110, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                      <div style={{ width: `${(f.n / (data?.foods[0]?.n || 1)) * 100}%`, height: '100%', background: GOLD, opacity: 0.7 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--t1)', fontFamily: 'var(--font-mono)', minWidth: 54, textAlign: 'right' }}>
                      {f.n.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </Section>
          </div>

          <div>
            {/* AI spend */}
            <Section title="AI SPEND (DeepSeek mandate)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                {(['today', '7d', '30d'] as const).map((w) => (
                  <div key={w} style={{ padding: '10px 8px', borderRadius: 10, background: 'rgba(212,168,83,.06)', border: '1px solid rgba(212,168,83,.2)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, fontFamily: 'var(--font-mono)' }}>
                      ${(cost(w)?.cost ?? 0).toFixed(2)}
                    </div>
                    <div className="ds-sub" style={{ fontSize: 9 }}>{w} · {cost(w)?.runs ?? 0} runs</div>
                  </div>
                ))}
              </div>
              <div className="ds-sub" style={{ fontSize: 9, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>By task · 7d</div>
              {(data?.aiByTask ?? []).slice(0, 6).map((t) => (
                <div key={t.task} className="row-b" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--font-mono)' }}>{t.task}</span>
                  <span style={{ fontSize: 11, color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>
                    ${t.cost.toFixed(3)} <span className="ds-sub">· {t.runs}</span>
                  </span>
                </div>
              ))}
            </Section>

            {/* Ops */}
            <Section
              title="OPS"
              action={
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  color: errRate > 5 ? 'rgb(239,68,68)' : 'var(--ok,#65D387)',
                }}>
                  {errRate}% error rate · 24h
                </span>
              }
            >
              {(data?.recentFailures ?? []).length === 0 ? (
                <div className="ds-sub" style={{ fontSize: 11 }}>No recent agent failures 🎉</div>
              ) : (
                (data?.recentFailures ?? []).map((f, i) => (
                  <div key={i} style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.15)' }}>
                    <div className="row-b">
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgb(252,165,165)' }}>{f.task} · {f.status}</span>
                      <span className="ds-sub" style={{ fontSize: 8 }}>{new Date(f.created_at).toLocaleString()}</span>
                    </div>
                    {f.error && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{f.error}</div>}
                  </div>
                ))
              )}
            </Section>

            {/* External oversight links */}
            <Section title="EXTERNAL">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['https://vercel.com/2p6y54z6w9-4465s-projects/trophe', 'Vercel deployments'],
                  ['https://supabase.com/dashboard/project/iwbpzwmidzvpiofnqexd', 'Supabase project'],
                  ['https://github.com/zsoist/trophe/actions', 'CI runs'],
                ].map(([href, label]) => (
                  <a key={href} href={href} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: 'var(--t2)', textDecoration: 'none', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(255,255,255,.02)' }}>
                    {label} ↗
                  </a>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

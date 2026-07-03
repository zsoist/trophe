'use client';

/**
 * Trophē Operations — super_admin command center.
 * Six sections: Overview, Costs, Users, Runs, Data, Audit.
 * Dense professional console: monospace metrics, CSS-only charts, no emojis.
 * Preferences (active tab, refresh cadence, cost window) persist in localStorage.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Panel, Kpi, Pills, HBar, ColumnChart, StatusChip,
  Empty, fmtUsd, fmtNum, fmtMs, timeAgo, MONO, GOLD,
} from '@/components/super/ui';
import CostsPanel from '@/components/super/CostsPanel';
import UsersPanel from '@/components/super/UsersPanel';
import RunsPanel from '@/components/super/RunsPanel';
import AuditPanel from '@/components/super/AuditPanel';

// ─── Types (overview API) ─────────────────────────────────────────────────────

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
  aiErrors: { errors_24h?: number; runs_24h?: number; p95_latency_24h?: number | null };
  foods: Array<{ source: string; n: number; embedded: number }>;
  logsByDay: Array<{ day: string; n: number }>;
  recentSignups: Array<{ full_name: string; role: string; created_at: string }>;
  recentFailures: Array<{ task: string; status: string; error: string | null; created_at: string }>;
  facets?: { models: string[]; tasks: string[] };
}

type Tab = 'overview' | 'costs' | 'users' | 'runs' | 'data' | 'audit';

const TABS: Array<{ v: Tab; label: string }> = [
  { v: 'overview', label: 'OVERVIEW' },
  { v: 'costs', label: 'COSTS' },
  { v: 'users', label: 'USERS' },
  { v: 'runs', label: 'RUNS' },
  { v: 'data', label: 'DATA' },
  { v: 'audit', label: 'AUDIT' },
];

const REFRESH_OPTS = [
  { v: '0', label: 'MANUAL' }, { v: '30', label: '30S' }, { v: '60', label: '60S' }, { v: '300', label: '5M' },
] as const;

const NAV_LINKS: Array<[string, string]> = [
  ['/coach', 'Coach view'],
  ['/dashboard', 'Client view'],
  ['/admin/costs', 'Costs admin'],
  ['/admin/orgs', 'Orgs admin'],
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperCommandCenter() {
  const [tab, setTab] = useState<Tab>('overview');
  const [refresh, setRefresh] = useState('60');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore persisted prefs after mount (SSR-safe)
  useEffect(() => {
    const t = localStorage.getItem('cc_tab') as Tab | null;
    if (t && TABS.some((x) => x.v === t)) setTab(t);
    const r = localStorage.getItem('cc_refresh');
    if (r && REFRESH_OPTS.some((x) => x.v === r)) setRefresh(r);
  }, []);

  const pickTab = useCallback((t: Tab) => { setTab(t); localStorage.setItem('cc_tab', t); }, []);
  const pickRefresh = useCallback((r: string) => { setRefresh(r); localStorage.setItem('cc_refresh', r); }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/super/overview');
    if (!res.ok) { setError(`${res.status} — super_admin required`); return; }
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const seconds = parseInt(refresh, 10);
    if (!seconds) return;
    const t = setInterval(load, seconds * 1000);
    return () => clearInterval(t);
  }, [load, refresh]);

  if (error) {
    return <div className="min-h-screen flex items-center justify-center ds-sub" style={{ background: 'var(--bg,#0a0a0a)', fontFamily: MONO }}>{error}</div>;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg,#0a0a0a)', paddingBottom: 40 }}>
      <div className="max-w-md lg:max-w-6xl mx-auto px-4 pt-4">
        {/* ─── Header ─── */}
        <div className="row-b" style={{ marginBottom: 10, alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="eye" style={{ color: GOLD, letterSpacing: '.12em' }}>TROPHĒ OPERATIONS</div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--t1)' }}>
              Command Center
            </div>
          </div>
          <div className="row-i" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Pills options={[...REFRESH_OPTS]} value={refresh} onChange={pickRefresh} small />
            <button
              onClick={load}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,.04)', color: 'var(--t2)', fontSize: 10, fontFamily: MONO, cursor: 'pointer' }}
            >
              refresh now
            </button>
            <span className="ds-sub" style={{ fontSize: 9, fontFamily: MONO }}>
              {data ? `as of ${new Date(data.generatedAt).toLocaleTimeString()}` : 'loading…'}
            </span>
          </div>
        </div>

        {/* ─── Section nav + quick links ─── */}
        <div className="row-b" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <Pills options={TABS} value={tab} onChange={pickTab} />
          <div className="row-i" style={{ gap: 6, flexWrap: 'wrap' }}>
            {NAV_LINKS.map(([href, label]) => (
              <Link
                key={href} href={href}
                style={{ fontSize: 10, fontFamily: MONO, color: 'var(--t3)', textDecoration: 'none', padding: '4px 9px', borderRadius: 8, border: '1px solid var(--line)', background: 'rgba(255,255,255,.02)' }}
              >
                {label} →
              </Link>
            ))}
          </div>
        </div>

        {/* ─── Sections ─── */}
        {tab === 'overview' && <OverviewSection data={data} />}
        {tab === 'costs' && <CostsPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'runs' && <RunsPanel facets={data?.facets} />}
        {tab === 'data' && <DataSection data={data} />}
        {tab === 'audit' && <AuditPanel />}
      </div>
    </div>
  );
}

// ─── Overview section ─────────────────────────────────────────────────────────

function OverviewSection({ data }: { data: Overview | null }) {
  const cost = (w: string) => data?.aiCosts.find((c) => c.window === w);
  const errRate = data?.aiErrors.runs_24h
    ? ((data.aiErrors.errors_24h ?? 0) / data.aiErrors.runs_24h) * 100
    : 0;

  if (!data) return <Empty label="loading platform state…" />;

  return (
    <div>
      {/* Health strip — the six numbers that matter at a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Kpi label="Spend today" value={fmtUsd(cost('today')?.cost)} accent sub={`${fmtNum(cost('today')?.runs)} runs`} />
        <Kpi label="Spend 30d" value={fmtUsd(cost('30d')?.cost)} sub={`${fmtNum(cost('30d')?.runs)} runs`} />
        <Kpi label="Error rate 24h" value={`${errRate.toFixed(1)}%`} warn={errRate > 5} sub={`${data.aiErrors.errors_24h ?? 0}/${data.aiErrors.runs_24h ?? 0} runs`} />
        <Kpi label="AI latency p95 24h" value={fmtMs(data.aiErrors.p95_latency_24h)} />
        <Kpi label="Active clients 7d" value={fmtNum(data.activity.active_clients_7d)} sub={`${fmtNum(data.activity.logs_7d)} logs`} />
        <Kpi label="Logs today" value={fmtNum(data.activity.logs_today)} />
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
        <div>
          {/* Activity */}
          <Panel title="ACTIVITY · 7 DAYS">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {([
                ['Messages', data.activity.messages_7d],
                ['Check-ins', data.activity.checkins_7d],
                ['Workouts', data.activity.workouts_7d],
                ['PRs hit', data.activity.prs_7d],
              ] as Array<[string, number | undefined]>).map(([label, v]) => (
                <div key={label} style={{ padding: '8px 8px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', fontFamily: MONO }}>{v ?? '—'}</div>
                  <div className="ds-sub" style={{ fontSize: 9 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="ds-sub" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                Food logs per day · 14d
              </div>
              {data.logsByDay?.length > 0
                ? <ColumnChart points={data.logsByDay.map((d) => ({ label: d.day, value: d.n }))} height={48} format={(v) => `${v} logs`} />
                : <Empty label="no logging activity" />}
            </div>
          </Panel>

          {/* People */}
          <Panel title="PEOPLE">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.people.map((p) => (
                <div key={p.role} style={{ flex: 1, minWidth: 84, textAlign: 'center', padding: '10px 6px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', fontFamily: MONO }}>{p.n}</div>
                  <div className="ds-sub" style={{ fontSize: 9, textTransform: 'uppercase' }}>{p.role.replace('_', ' ')}s</div>
                </div>
              ))}
            </div>
            <div className="ds-sub" style={{ fontSize: 10, marginTop: 10, fontFamily: MONO }}>
              Latest: {data.recentSignups.slice(0, 4).map((s) => `${s.full_name} (${s.role})`).join(' · ') || '—'}
            </div>
          </Panel>
        </div>

        <div>
          {/* AI spend summary */}
          <Panel title="AI SPEND BY TASK · 7D" meta={<span className="ds-sub" style={{ fontSize: 9, fontFamily: MONO }}>full analytics in COSTS</span>}>
            {data.aiByTask.length === 0 ? <Empty label="no runs" /> : (
              data.aiByTask.slice(0, 8).map((t) => (
                <HBar
                  key={t.task}
                  label={t.task}
                  value={t.cost}
                  max={Math.max(...data.aiByTask.map((x) => x.cost), 0.0001)}
                  display={`${fmtUsd(t.cost, 3)} · ${fmtNum(t.runs)}`}
                />
              ))
            )}
          </Panel>

          {/* Failures */}
          <Panel
            title="RECENT FAILURES"
            meta={
              <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 700, color: errRate > 5 ? '#EF6A5A' : 'var(--ok,#65D387)' }}>
                {errRate.toFixed(1)}% · 24h
              </span>
            }
          >
            {data.recentFailures.length === 0 ? (
              <Empty label="no recent agent failures" />
            ) : (
              data.recentFailures.map((f, i) => (
                <div key={i} style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.15)' }}>
                  <div className="row-b">
                    <span style={{ fontSize: 10, fontFamily: MONO, color: '#FCA5A5' }}>{f.task} <StatusChip status={f.status} /></span>
                    <span className="ds-sub" style={{ fontSize: 8, fontFamily: MONO }}>{timeAgo(f.created_at)}</span>
                  </div>
                  {f.error && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3, fontFamily: MONO }}>{f.error}</div>}
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─── Data section ─────────────────────────────────────────────────────────────

function DataSection({ data }: { data: Overview | null }) {
  const totalFoods = useMemo(() => data?.foods.reduce((s, f) => s + f.n, 0) ?? 0, [data]);
  const totalEmbedded = useMemo(() => data?.foods.reduce((s, f) => s + f.embedded, 0) ?? 0, [data]);

  if (!data) return <Empty label="loading…" />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Kpi label="Foods in database" value={fmtNum(totalFoods)} accent />
        <Kpi label="Embedding coverage" value={`${totalFoods ? Math.round((totalEmbedded / totalFoods) * 100) : 0}%`} sub={`${fmtNum(totalEmbedded)} embedded`} />
        <Kpi label="Sources" value={data.foods.length} />
      </div>

      <Panel title="FOODS BY SOURCE">
        {data.foods.map((f) => (
          <div key={f.source} style={{ marginBottom: 8 }}>
            <HBar
              label={f.source}
              value={f.n}
              max={data.foods[0]?.n || 1}
              display={fmtNum(f.n)}
            />
            <div className="ds-sub" style={{ fontSize: 9, fontFamily: MONO, marginLeft: 2, marginTop: -2 }}>
              embeddings {f.n ? Math.round((f.embedded / f.n) * 100) : 0}%
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

'use client';

/**
 * Users panel — full account roster: sign-in recency, logging volume,
 * attributable AI spend. Filter by role/activity, sort any column,
 * click a row for the per-user drill-down drawer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Panel, Pills, Kpi, StatusChip, RoleChip, TableWrap, Th, Td, Empty,
  fmtUsd, fmtNum, fmtMs, timeAgo, MONO, GOLD,
} from './ui';

interface UserRow {
  id: string; email: string | null; full_name: string | null; role: string | null;
  language: string | null; created_at: string; last_sign_in_at: string | null;
  logs_total: number; logs_30d: number; last_log_at: string | null;
  ai_cost_30d: number; ai_runs_30d: number; messages_30d: number; workouts_30d: number;
}

interface Detail {
  recentLogs: Array<{ food_name: string; calories: number | null; source: string | null; logged_date: string; meal_type: string | null }>;
  recentRuns: Array<{ task: string; model: string; cost: number; latency_ms: number | null; status: string; created_at: string }>;
  spendByTask: Array<{ task: string; cost: number; runs: number }>;
}

type SortKey = 'last_sign_in_at' | 'created_at' | 'logs_30d' | 'logs_total' | 'ai_cost_30d' | 'ai_runs_30d';

const ROLE_OPTS = [
  { v: '', label: 'ALL' }, { v: 'client', label: 'CLIENTS' }, { v: 'coach', label: 'COACHES' },
  { v: 'admin', label: 'ADMINS' }, { v: 'super_admin', label: 'SUPER' },
] as const;

const ACTIVITY_OPTS = [
  { v: '', label: 'ANY' }, { v: 'active7', label: 'ACTIVE 7D' },
  { v: 'active30', label: 'ACTIVE 30D' }, { v: 'dormant', label: 'DORMANT' },
] as const;

export default function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [role, setRole] = useState('');
  const [activity, setActivity] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_sign_in_at');
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  // Snapshot the clock once per mount — recency buckets don't need live ticking,
  // and calling Date.now() during render violates react-hooks/purity.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch('/api/super/users')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setUsers(d.users ?? []))
      .finally(() => setLoading(false));
  }, []);

  const openDetail = useCallback(async (u: UserRow) => {
    setSelected(u);
    setDetail(null);
    const res = await fetch(`/api/super/users?userId=${u.id}`);
    if (res.ok) setDetail(await res.json());
  }, []);

  const filtered = useMemo(() => {
    let rows = users;
    if (role) rows = rows.filter((u) => u.role === role);
    if (activity === 'active7') rows = rows.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * 86400_000);
    if (activity === 'active30') rows = rows.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 30 * 86400_000);
    if (activity === 'dormant') rows = rows.filter((u) => !u.last_sign_in_at || now - new Date(u.last_sign_in_at).getTime() >= 30 * 86400_000);
    return [...rows].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return bv - av;
      return String(bv).localeCompare(String(av));
    });
  }, [users, role, activity, sortKey, now]);

  const signIns7d = users.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * 86400_000).length;
  const totalSpend = users.reduce((s, u) => s + u.ai_cost_30d, 0);

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Kpi label="Accounts" value={fmtNum(users.length)} accent />
        <Kpi label="Signed in · 7d" value={fmtNum(signIns7d)} />
        <Kpi label="Attributed AI spend · 30d" value={fmtUsd(totalSpend)} />
        <Kpi label="Logs · 30d (all users)" value={fmtNum(users.reduce((s, u) => s + u.logs_30d, 0))} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Pills options={[...ROLE_OPTS]} value={role} onChange={setRole} small />
        <Pills options={[...ACTIVITY_OPTS]} value={activity} onChange={setActivity} small />
      </div>

      <Panel title={`ACCOUNTS · ${filtered.length}`} meta={<span className="ds-sub" style={{ fontSize: 9, fontFamily: MONO }}>click a row for detail</span>}>
        {loading ? <Empty label="loading…" /> : filtered.length === 0 ? <Empty label="no matches" /> : (
          <TableWrap maxHeight={520}>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th right onClick={() => setSortKey('last_sign_in_at')} active={sortKey === 'last_sign_in_at'}>Last sign-in</Th>
                <Th right onClick={() => setSortKey('logs_30d')} active={sortKey === 'logs_30d'}>Logs 30d</Th>
                <Th right onClick={() => setSortKey('logs_total')} active={sortKey === 'logs_total'}>Logs total</Th>
                <Th right onClick={() => setSortKey('ai_runs_30d')} active={sortKey === 'ai_runs_30d'}>AI runs 30d</Th>
                <Th right onClick={() => setSortKey('ai_cost_30d')} active={sortKey === 'ai_cost_30d'}>AI cost 30d</Th>
                <Th right>Msgs 30d</Th>
                <Th right>Workouts 30d</Th>
                <Th right onClick={() => setSortKey('created_at')} active={sortKey === 'created_at'}>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => openDetail(u)}
                  style={{ cursor: 'pointer', background: selected?.id === u.id ? 'rgba(212,168,83,.05)' : undefined }}
                >
                  <Td>
                    <div style={{ fontWeight: 600 }}>{u.full_name ?? '(no profile)'}</div>
                    <div className="ds-sub" style={{ fontSize: 9, fontFamily: MONO }}>{u.email ?? u.id.slice(0, 8)}</div>
                  </Td>
                  <Td>{u.role ? <RoleChip role={u.role} /> : <span className="ds-sub" style={{ fontSize: 9 }}>—</span>}</Td>
                  <Td right mono dim>{timeAgo(u.last_sign_in_at)}</Td>
                  <Td right mono>{fmtNum(u.logs_30d)}</Td>
                  <Td right mono dim>{fmtNum(u.logs_total)}</Td>
                  <Td right mono dim>{fmtNum(u.ai_runs_30d)}</Td>
                  <Td right mono style={{ color: u.ai_cost_30d > 0 ? GOLD : undefined }}>{fmtUsd(u.ai_cost_30d, 3)}</Td>
                  <Td right mono dim>{fmtNum(u.messages_30d)}</Td>
                  <Td right mono dim>{fmtNum(u.workouts_30d)}</Td>
                  <Td right mono dim>{new Date(u.created_at).toLocaleDateString()}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>

      {/* Drill-down drawer */}
      {selected && (
        <Panel
          title={`DETAIL · ${selected.full_name ?? selected.email ?? selected.id.slice(0, 8)}`}
          meta={
            <button
              onClick={() => { setSelected(null); setDetail(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--t3)', fontSize: 11, cursor: 'pointer', fontFamily: MONO }}
            >
              close ×
            </button>
          }
        >
          {!detail ? <Empty label="loading…" /> : (
            <div className="lg:grid lg:grid-cols-2 lg:gap-4">
              <div>
                <div className="eye" style={{ fontSize: 9, marginBottom: 6 }}>RECENT FOOD LOGS</div>
                {detail.recentLogs.length === 0 ? <Empty label="no logs" /> : (
                  <TableWrap maxHeight={260}>
                    <thead><tr><Th>Food</Th><Th right>kcal</Th><Th>Source</Th><Th right>Date</Th></tr></thead>
                    <tbody>
                      {detail.recentLogs.map((l, i) => (
                        <tr key={i}>
                          <Td>{l.food_name}</Td>
                          <Td right mono>{l.calories != null ? Math.round(l.calories) : '—'}</Td>
                          <Td mono dim>{l.source ?? 'manual'}</Td>
                          <Td right mono dim>{l.logged_date}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </div>
              <div>
                <div className="eye" style={{ fontSize: 9, marginBottom: 6, marginTop: 0 }}>AI SPEND BY TASK (ALL TIME)</div>
                {detail.spendByTask.length === 0 ? <Empty label="no AI usage" /> : (
                  detail.spendByTask.map((s) => (
                    <div key={s.task} className="row-b" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontFamily: MONO, color: 'var(--t2)' }}>{s.task}</span>
                      <span style={{ fontSize: 11, fontFamily: MONO, color: 'var(--t1)' }}>{fmtUsd(s.cost, 3)} · {s.runs}</span>
                    </div>
                  ))
                )}
                <div className="eye" style={{ fontSize: 9, margin: '12px 0 6px' }}>RECENT AI RUNS</div>
                {detail.recentRuns.length === 0 ? <Empty label="no runs" /> : (
                  <TableWrap maxHeight={200}>
                    <thead><tr><Th>Task</Th><Th right>Cost</Th><Th right>Latency</Th><Th>Status</Th></tr></thead>
                    <tbody>
                      {detail.recentRuns.map((r, i) => (
                        <tr key={i}>
                          <Td mono>{r.task}</Td>
                          <Td right mono>{fmtUsd(r.cost, 4)}</Td>
                          <Td right mono dim>{fmtMs(r.latency_ms)}</Td>
                          <Td><StatusChip status={r.status} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

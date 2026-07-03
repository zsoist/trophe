'use client';

/**
 * Runs panel — live agent_runs feed with status/task/model filters,
 * pagination, and expandable full error messages.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Panel, Pills, Select, StatusChip, TableWrap, Th, Td, Empty,
  fmtUsd, fmtNum, fmtMs, MONO,
} from './ui';

interface RunRow {
  id: string; task: string; provider: string | null; model: string;
  status: string; cost: number; tokens_in: number; tokens_out: number;
  cache_read: number; latency_ms: number | null; fallback_from: string | null;
  error: string | null; user_id: string | null; created_at: string;
}

const WINDOW_OPTS = [
  { v: '24h', label: '24H' }, { v: '7d', label: '7D' }, { v: '30d', label: '30D' }, { v: 'all', label: 'ALL' },
] as const;

const STATUS_OPTS = [
  { v: '', label: 'ALL' }, { v: 'completed', label: 'OK' }, { v: 'failed', label: 'FAILED' },
] as const;

const PAGE = 50;

export default function RunsPanel({ facets }: { facets?: { models: string[]; tasks: string[] } }) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [win, setWin] = useState('24h');
  const [status, setStatus] = useState('');
  const [task, setTask] = useState('');
  const [model, setModel] = useState('');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ window: win, limit: String(PAGE), offset: String(offset) });
    if (status) q.set('status', status);
    if (task) q.set('task', task);
    if (model) q.set('model', model);
    const res = await fetch(`/api/super/runs?${q}`);
    if (res.ok) {
      const d = await res.json();
      setRows(d.rows ?? []);
      setTotal(d.total ?? 0);
    }
    setLoading(false);
  }, [win, status, task, model, offset]);

  useEffect(() => { load(); }, [load]);
  // Reset paging whenever a filter changes
  useEffect(() => { setOffset(0); }, [win, status, task, model]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Pills options={[...WINDOW_OPTS]} value={win} onChange={setWin} />
        <Pills options={[...STATUS_OPTS]} value={status} onChange={setStatus} small />
        <Select value={task} onChange={setTask} options={facets?.tasks ?? []} allLabel="all tasks" />
        <Select value={model} onChange={setModel} options={facets?.models ?? []} allLabel="all models" />
        {loading && <span className="ds-sub" style={{ fontSize: 10, fontFamily: MONO }}>loading…</span>}
      </div>

      <Panel
        title={`RUNS · ${fmtNum(total)}`}
        meta={
          <div className="row-i" style={{ gap: 6 }}>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
              style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 6, color: offset === 0 ? 'var(--t3)' : 'var(--t1)', fontSize: 10, fontFamily: MONO, padding: '2px 8px', cursor: offset === 0 ? 'default' : 'pointer' }}
            >
              prev
            </button>
            <span className="ds-sub" style={{ fontSize: 9, fontFamily: MONO }}>
              {offset + 1}–{Math.min(offset + PAGE, total)}
            </span>
            <button
              disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}
              style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 6, color: offset + PAGE >= total ? 'var(--t3)' : 'var(--t1)', fontSize: 10, fontFamily: MONO, padding: '2px 8px', cursor: offset + PAGE >= total ? 'default' : 'pointer' }}
            >
              next
            </button>
          </div>
        }
      >
        {rows.length === 0 ? <Empty label={loading ? 'loading…' : 'no runs match'} /> : (
          <TableWrap maxHeight={560}>
            <thead>
              <tr>
                <Th>When</Th><Th>Task</Th><Th>Model</Th><Th>Status</Th>
                <Th right>Cost</Th><Th right>Tok in/out</Th><Th right>Cache</Th><Th right>Latency</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    style={{ cursor: r.error || r.fallback_from ? 'pointer' : 'default' }}
                  >
                    <Td mono dim>{new Date(r.created_at).toLocaleTimeString()} <span style={{ opacity: 0.6 }}>{new Date(r.created_at).toLocaleDateString()}</span></Td>
                    <Td mono>{r.task}</Td>
                    <Td mono dim>{r.model}{r.fallback_from ? ' *' : ''}</Td>
                    <Td><StatusChip status={r.status} /></Td>
                    <Td right mono>{fmtUsd(r.cost, 4)}</Td>
                    <Td right mono dim>{fmtNum(r.tokens_in)}/{fmtNum(r.tokens_out)}</Td>
                    <Td right mono dim>{r.cache_read > 0 ? fmtNum(r.cache_read) : '—'}</Td>
                    <Td right mono>{fmtMs(r.latency_ms)}</Td>
                  </tr>
                  {expanded === r.id && (r.error || r.fallback_from) && (
                    <tr>
                      <Td colSpan={8} style={{ maxWidth: 'none', whiteSpace: 'normal', background: 'rgba(239,68,68,.04)' }}>
                        {r.fallback_from && (
                          <div style={{ fontSize: 10, fontFamily: MONO, color: '#F0C36A', marginBottom: 4 }}>
                            fallback: {r.fallback_from} → {r.model}
                          </div>
                        )}
                        {r.error && (
                          <div style={{ fontSize: 10, fontFamily: MONO, color: '#FCA5A5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {r.error}
                          </div>
                        )}
                      </Td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

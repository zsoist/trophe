'use client';

/**
 * Audit panel — first read surface for the audit_log table (existed since W5,
 * RLS super_admin-only, never had a viewer) + GDPR data_requests queue +
 * correction-flywheel counter + external oversight links.
 */

import { useEffect, useState } from 'react';
import {
  Panel, Kpi, StatusChip, RoleChip, TableWrap, Th, Td, Empty,
  fmtNum, timeAgo, MONO,
} from './ui';

interface AuditData {
  events: Array<{ id: number; actor: string | null; actor_role: string | null; action: string; table_name: string | null; record_id: string | null; ip: string | null; created_at: string }>;
  actionFacets: Array<{ action: string; n: number }>;
  dataRequests: Array<{ id: string; user_name: string | null; request_type: string; status: string; requested_at: string; due_at: string | null; completed_at: string | null }>;
  corrections: { n: number; last_at: string | null };
}

const EXTERNAL_LINKS: Array<[string, string]> = [
  ['https://vercel.com/2p6y54z6w9-4465s-projects/trophe', 'Vercel deployments'],
  ['https://supabase.com/dashboard/project/iwbpzwmidzvpiofnqexd', 'Supabase project'],
  ['https://github.com/zsoist/trophe/actions', 'GitHub CI runs'],
  ['https://github.com/zsoist/trophe/pulls', 'Open pull requests'],
];

export default function AuditPanel() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/super/audit')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const pendingRequests = (data?.dataRequests ?? []).filter((d) => d.status === 'pending' || d.status === 'in_progress');

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Kpi label="Audit events" value={fmtNum(data?.events.length ?? 0)} sub={data?.events[0] ? `last ${timeAgo(data.events[0].created_at)}` : 'none recorded'} />
        <Kpi label="Data requests pending" value={fmtNum(pendingRequests.length)} warn={pendingRequests.length > 0} sub={`${data?.dataRequests.length ?? 0} total`} />
        <Kpi label="Parse corrections captured" value={fmtNum(data?.corrections.n ?? 0)} sub={data?.corrections.last_at ? `last ${timeAgo(data.corrections.last_at)}` : 'flywheel idle'} />
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
        <div>
          <Panel title="AUDIT LOG">
            {loading ? <Empty label="loading…" /> : (data?.events ?? []).length === 0 ? (
              <Empty label="no audit events recorded yet — writes appear here as coach/admin actions accumulate" />
            ) : (
              <TableWrap maxHeight={420}>
                <thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Table</Th></tr></thead>
                <tbody>
                  {(data?.events ?? []).map((e) => (
                    <tr key={e.id}>
                      <Td mono dim>{timeAgo(e.created_at)}</Td>
                      <Td>
                        {e.actor ?? 'system'}
                        {e.actor_role ? <span style={{ marginLeft: 6 }}><RoleChip role={e.actor_role} /></span> : null}
                      </Td>
                      <Td mono>{e.action}</Td>
                      <Td mono dim>{e.table_name ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>
        </div>

        <div>
          <Panel title="GDPR DATA REQUESTS">
            {loading ? <Empty label="loading…" /> : (data?.dataRequests ?? []).length === 0 ? (
              <Empty label="no data requests — queue is clear" />
            ) : (
              <TableWrap maxHeight={220}>
                <thead><tr><Th>User</Th><Th>Type</Th><Th>Status</Th><Th right>Requested</Th><Th right>Due</Th></tr></thead>
                <tbody>
                  {(data?.dataRequests ?? []).map((d) => (
                    <tr key={d.id}>
                      <Td>{d.user_name ?? '—'}</Td>
                      <Td mono>{d.request_type}</Td>
                      <Td><StatusChip status={d.status} /></Td>
                      <Td right mono dim>{timeAgo(d.requested_at)}</Td>
                      <Td right mono dim>{d.due_at ? new Date(d.due_at).toLocaleDateString() : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>

          <Panel title="EXTERNAL OVERSIGHT">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {EXTERNAL_LINKS.map(([href, label]) => (
                <a
                  key={href} href={href} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--t2)', textDecoration: 'none', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(255,255,255,.02)', fontFamily: MONO }}
                >
                  {label} ↗
                </a>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

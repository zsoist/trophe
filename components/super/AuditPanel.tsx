"use client";

/**
 * Audit panel — first read surface for the audit_log table (existed since W5,
 * RLS super_admin-only, never had a viewer) + GDPR data_requests queue +
 * correction-flywheel counter + external oversight links.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Panel,
  Kpi,
  StatusChip,
  RoleChip,
  TableWrap,
  Th,
  Td,
  Empty,
  fmtNum,
  timeAgo,
  MONO,
  GOLD,
} from "./ui";

interface AuditData {
  events: Array<{
    id: number;
    actor: string | null;
    actor_role: string | null;
    action: string;
    table_name: string | null;
    record_id: string | null;
    ip: string | null;
    created_at: string;
  }>;
  actionFacets: Array<{ action: string; n: number }>;
  dataRequests: Array<{
    id: string;
    user_name: string | null;
    request_type: string;
    status: string;
    requested_at: string;
    due_at: string | null;
    completed_at: string | null;
  }>;
  corrections: { n: number; last_at: string | null };
}

const EXTERNAL_LINKS: Array<[string, string]> = [
  ["https://vercel.com/2p6y54z6w9-4465s-projects/trophe", "Vercel deployments"],
  [
    "https://supabase.com/dashboard/project/iwbpzwmidzvpiofnqexd",
    "Supabase project",
  ],
  ["https://github.com/zsoist/trophe/actions", "GitHub CI runs"],
  ["https://github.com/zsoist/trophe/pulls", "Open pull requests"],
];

export default function AuditPanel() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dryRunReport, setDryRunReport] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/super/audit")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((value) => {
        setData(value);
        setError(null);
      })
      .catch(() => {
        setData(null);
        setError("Unable to load audit data.");
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // GDPR fulfilment actions (WP5) — POST /api/super/data-requests
  const act = useCallback(
    async (requestId: string, action: string, reason?: string) => {
      setBusy(requestId);
      try {
        const res = await fetch("/api/super/data-requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId, action, reason }),
        });
        const body = await res.json().catch(() => ({}));
        if (action === "erasure_dry_run" && body.result) {
          const lines = Object.entries(
            body.result.counts as Record<string, number>,
          ).map(([k, v]) => `${k}: ${v}`);
          const errs = (body.result.errors as string[]).map(
            (e) => `ERROR ${e}`,
          );
          setDryRunReport({
            id: requestId,
            text: [...lines, ...errs].join("\n") || "nothing to erase",
          });
        } else if (!res.ok) {
          setDryRunReport({
            id: requestId,
            text: `FAILED (${res.status}): ${body.error ?? JSON.stringify(body.result?.errors ?? body)}`,
          });
        } else {
          setDryRunReport(null);
        }
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const confirmErase = useCallback(
    (requestId: string, userName: string | null) => {
      const expected = "ERASE";
      const typed = window.prompt(
        `IRREVERSIBLE: this deletes ALL data + the account for ${userName ?? "this user"}.\n` +
          `Run the dry-run first. Type ${expected} to proceed.`,
      );
      if (typed === expected) act(requestId, "execute_erasure");
    },
    [act],
  );

  const pendingRequests = (data?.dataRequests ?? []).filter(
    (d) => d.status === "pending" || d.status === "in_progress",
  );

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-3 rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]"
        >
          {error}{" "}
          <button
            type="button"
            onClick={load}
            className="ml-2 min-h-11 rounded px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Retry
          </button>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Kpi
          label="Audit events"
          value={fmtNum(data?.events.length ?? 0)}
          sub={
            data?.events[0]
              ? `last ${timeAgo(data.events[0].created_at)}`
              : "none recorded"
          }
        />
        <Kpi
          label="Data requests pending"
          value={fmtNum(pendingRequests.length)}
          warn={pendingRequests.length > 0}
          sub={`${data?.dataRequests.length ?? 0} total`}
        />
        <Kpi
          label="Parse corrections captured"
          value={fmtNum(data?.corrections.n ?? 0)}
          sub={
            data?.corrections.last_at
              ? `last ${timeAgo(data.corrections.last_at)}`
              : "flywheel idle"
          }
        />
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-4">
        <div>
          <Panel title="AUDIT LOG">
            {loading ? (
              <Empty label="loading…" />
            ) : (data?.events ?? []).length === 0 ? (
              <Empty label="no audit events recorded yet — writes appear here as coach/admin actions accumulate" />
            ) : (
              <TableWrap maxHeight={420}>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Actor</Th>
                    <Th>Action</Th>
                    <Th>Table</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.events ?? []).map((e) => (
                    <tr key={e.id}>
                      <Td mono dim>
                        {timeAgo(e.created_at)}
                      </Td>
                      <Td>
                        {e.actor ?? "system"}
                        {e.actor_role ? (
                          <span style={{ marginLeft: 6 }}>
                            <RoleChip role={e.actor_role} />
                          </span>
                        ) : null}
                      </Td>
                      <Td mono>{e.action}</Td>
                      <Td mono dim>
                        {e.table_name ?? "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>
        </div>

        <div>
          <Panel title="GDPR DATA REQUESTS">
            {loading ? (
              <Empty label="loading…" />
            ) : (data?.dataRequests ?? []).length === 0 ? (
              <Empty label="no data requests — queue is clear" />
            ) : (
              <TableWrap maxHeight={280}>
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th right>Requested</Th>
                    <Th right>Due</Th>
                    <Th>Fulfil</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.dataRequests ?? []).map((d) => {
                    const open =
                      d.status === "pending" || d.status === "in_progress";
                    const btn = (
                      label: string,
                      onClick: () => void,
                      danger?: boolean,
                    ) => (
                      <button
                        className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        key={label}
                        disabled={busy === d.id}
                        onClick={onClick}
                        style={{
                          padding: "2px 7px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontFamily: MONO,
                          fontWeight: 700,
                          cursor: busy === d.id ? "wait" : "pointer",
                          marginRight: 4,
                          background: danger
                            ? "var(--status-danger-bg)"
                            : "var(--surface-2)",
                          border: `1px solid ${danger ? "var(--status-danger-border)" : "var(--border-default)"}`,
                          color: danger ? "var(--status-danger-fg)" : GOLD,
                        }}
                      >
                        {label}
                      </button>
                    );
                    return (
                      <tr key={d.id}>
                        <Td>{d.user_name ?? "—"}</Td>
                        <Td mono>{d.request_type}</Td>
                        <Td>
                          <StatusChip status={d.status} />
                        </Td>
                        <Td right mono dim>
                          {timeAgo(d.requested_at)}
                        </Td>
                        <Td right mono dim>
                          {d.due_at
                            ? new Date(d.due_at).toLocaleDateString()
                            : "—"}
                        </Td>
                        <Td style={{ maxWidth: "none" }}>
                          {open &&
                            d.status === "pending" &&
                            btn("start", () => act(d.id, "start"))}
                          {open &&
                            d.request_type === "deletion" &&
                            btn("dry-run", () => act(d.id, "erasure_dry_run"))}
                          {open &&
                            d.request_type === "deletion" &&
                            btn(
                              "erase",
                              () => confirmErase(d.id, d.user_name),
                              true,
                            )}
                          {open &&
                            d.request_type !== "deletion" &&
                            btn("complete", () => act(d.id, "complete"))}
                          {open &&
                            btn("reject", () => {
                              const reason = window.prompt(
                                "Rejection reason (recorded in the audit log):",
                              );
                              if (reason) act(d.id, "reject", reason);
                            })}
                          {!open && (
                            <span
                              className="ds-sub"
                              style={{ fontSize: 12, fontFamily: MONO }}
                            >
                              closed
                            </span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
            {dryRunReport && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "var(--surface-active)",
                  border: "1px solid var(--action-primary)",
                }}
              >
                <div className="row-b" style={{ marginBottom: 4 }}>
                  <span className="eye" style={{ fontSize: 12 }}>
                    ERASURE REPORT
                  </span>
                  <button
                    className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    onClick={() => setDryRunReport(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--content-muted)",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: MONO,
                    }}
                  >
                    ×
                  </button>
                </div>
                <pre
                  style={{
                    fontSize: 12,
                    fontFamily: MONO,
                    color: "var(--content-secondary)",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {dryRunReport.text}
                </pre>
              </div>
            )}
          </Panel>

          <Panel title="EXTERNAL OVERSIGHT">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {EXTERNAL_LINKS.map(([href, label]) => (
                <a
                  key={href}
                  className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    color: "var(--content-secondary)",
                    textDecoration: "none",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-2)",
                    fontFamily: MONO,
                  }}
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

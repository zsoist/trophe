"use client";

/**
 * Users panel — full account roster: sign-in recency, logging volume,
 * attributable AI spend. Filter by role/activity, sort any column,
 * use a dedicated action for the per-user drill-down drawer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  Pills,
  Kpi,
  StatusChip,
  RoleChip,
  TableWrap,
  Th,
  Td,
  Empty,
  fmtUsd,
  fmtNum,
  fmtMs,
  timeAgo,
  MONO,
  GOLD,
} from "./ui";

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  language: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  logs_total: number;
  logs_30d: number;
  last_log_at: string | null;
  ai_cost_30d: number;
  ai_runs_30d: number;
  messages_30d: number;
  workouts_30d: number;
}

interface Detail {
  recentLogs: Array<{
    food_name: string;
    calories: number | null;
    source: string | null;
    logged_date: string;
    meal_type: string | null;
  }>;
  recentRuns: Array<{
    task: string;
    model: string;
    cost: number;
    latency_ms: number | null;
    status: string;
    created_at: string;
  }>;
  spendByTask: Array<{ task: string; cost: number; runs: number }>;
}

type SortKey =
  | "last_sign_in_at"
  | "created_at"
  | "logs_30d"
  | "logs_total"
  | "ai_cost_30d"
  | "ai_runs_30d";

const ROLE_OPTS = [
  { v: "", label: "ALL" },
  { v: "client", label: "CLIENTS" },
  { v: "coach", label: "COACHES" },
  { v: "admin", label: "ADMINS" },
  { v: "super_admin", label: "SUPER" },
] as const;

const ACTIVITY_OPTS = [
  { v: "", label: "ANY" },
  { v: "active7", label: "ACTIVE 7D" },
  { v: "active30", label: "ACTIVE 30D" },
  { v: "dormant", label: "DORMANT" },
] as const;

export default function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [role, setRole] = useState("");
  const [activity, setActivity] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_sign_in_at");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const detailRequest = useRef(0);
  // Snapshot the clock once per mount — recency buckets don't need live ticking,
  // and calling Date.now() during render violates react-hooks/purity.
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/super/users");
      if (!response.ok) throw new Error("Unable to load users.");
      const data = await response.json();
      setUsers(data.users ?? []);
      setError(null);
    } catch {
      setUsers([]);
      setError("Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (u: UserRow) => {
    const request = ++detailRequest.current;
    setSelected(u);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/super/users?userId=${u.id}`);
      if (!response.ok) throw new Error("Unable to load user detail.");
      const data = await response.json();
      if (request === detailRequest.current) setDetail(data);
    } catch {
      if (request === detailRequest.current)
        setDetailError("Unable to load user detail.");
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    detailRequest.current += 1;
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const filtered = useMemo(() => {
    let rows = users;
    if (role) rows = rows.filter((u) => u.role === role);
    if (activity === "active7")
      rows = rows.filter(
        (u) =>
          u.last_sign_in_at &&
          now - new Date(u.last_sign_in_at).getTime() < 7 * 86400_000,
      );
    if (activity === "active30")
      rows = rows.filter(
        (u) =>
          u.last_sign_in_at &&
          now - new Date(u.last_sign_in_at).getTime() < 30 * 86400_000,
      );
    if (activity === "dormant")
      rows = rows.filter(
        (u) =>
          !u.last_sign_in_at ||
          now - new Date(u.last_sign_in_at).getTime() >= 30 * 86400_000,
      );
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return bv - av;
      return String(bv).localeCompare(String(av));
    });
  }, [users, role, activity, sortKey, now]);

  const signIns7d = users.filter(
    (u) =>
      u.last_sign_in_at &&
      now - new Date(u.last_sign_in_at).getTime() < 7 * 86400_000,
  ).length;
  const totalSpend = users.reduce((s, u) => s + u.ai_cost_30d, 0);

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
            onClick={() => void load()}
            className="ml-2 min-h-11 rounded px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            Retry
          </button>
        </div>
      )}
      {/* KPI strip — honest loading placeholders (roster joins auth.users with
          4 LATERAL aggregates; first paint can lag a second or two) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Kpi
          label="Accounts"
          value={loading ? "…" : fmtNum(users.length)}
          accent
        />
        <Kpi label="Signed in · 7d" value={loading ? "…" : fmtNum(signIns7d)} />
        <Kpi
          label="Attributed AI spend · 30d"
          value={loading ? "…" : fmtUsd(totalSpend)}
        />
        <Kpi
          label="Logs · 30d (all users)"
          value={
            loading ? "…" : fmtNum(users.reduce((s, u) => s + u.logs_30d, 0))
          }
        />
      </div>

      {/* Filters */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <Pills options={[...ROLE_OPTS]} value={role} onChange={setRole} small />
        <Pills
          options={[...ACTIVITY_OPTS]}
          value={activity}
          onChange={setActivity}
          small
        />
      </div>

      <Panel
        title={`ACCOUNTS · ${filtered.length}`}
        meta={
          <span className="ds-sub" style={{ fontSize: 12, fontFamily: MONO }}>
            use View details for detail
          </span>
        }
      >
        {loading ? (
          <Empty label="loading…" />
        ) : filtered.length === 0 ? (
          <Empty label="no matches" />
        ) : (
          <TableWrap maxHeight={520}>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th
                  right
                  onClick={() => setSortKey("last_sign_in_at")}
                  active={sortKey === "last_sign_in_at"}
                >
                  Last sign-in
                </Th>
                <Th
                  right
                  onClick={() => setSortKey("logs_30d")}
                  active={sortKey === "logs_30d"}
                >
                  Logs 30d
                </Th>
                <Th
                  right
                  onClick={() => setSortKey("logs_total")}
                  active={sortKey === "logs_total"}
                >
                  Logs total
                </Th>
                <Th
                  right
                  onClick={() => setSortKey("ai_runs_30d")}
                  active={sortKey === "ai_runs_30d"}
                >
                  AI runs 30d
                </Th>
                <Th
                  right
                  onClick={() => setSortKey("ai_cost_30d")}
                  active={sortKey === "ai_cost_30d"}
                >
                  AI cost 30d
                </Th>
                <Th right>Msgs 30d</Th>
                <Th right>Workouts 30d</Th>
                <Th
                  right
                  onClick={() => setSortKey("created_at")}
                  active={sortKey === "created_at"}
                >
                  Joined
                </Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  style={{
                    background:
                      selected?.id === u.id
                        ? "var(--surface-active)"
                        : undefined,
                  }}
                >
                  <Td>
                    <div style={{ fontWeight: 600 }}>
                      {u.full_name ?? "(no profile)"}
                    </div>
                    <div
                      className="ds-sub"
                      style={{ fontSize: 12, fontFamily: MONO }}
                    >
                      {u.email ?? u.id.slice(0, 8)}
                    </div>
                  </Td>
                  <Td>
                    {u.role ? (
                      <RoleChip role={u.role} />
                    ) : (
                      <span className="ds-sub" style={{ fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </Td>
                  <Td right mono dim>
                    {timeAgo(u.last_sign_in_at)}
                  </Td>
                  <Td right mono>
                    {fmtNum(u.logs_30d)}
                  </Td>
                  <Td right mono dim>
                    {fmtNum(u.logs_total)}
                  </Td>
                  <Td right mono dim>
                    {fmtNum(u.ai_runs_30d)}
                  </Td>
                  <Td
                    right
                    mono
                    style={{ color: u.ai_cost_30d > 0 ? GOLD : undefined }}
                  >
                    {fmtUsd(u.ai_cost_30d, 3)}
                  </Td>
                  <Td right mono dim>
                    {fmtNum(u.messages_30d)}
                  </Td>
                  <Td right mono dim>
                    {fmtNum(u.workouts_30d)}
                  </Td>
                  <Td right mono dim>
                    {new Date(u.created_at).toLocaleDateString()}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => openDetail(u)}
                      className="min-h-11 whitespace-nowrap rounded px-2 text-xs text-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                      View details
                    </button>
                  </Td>
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
              onClick={closeDetail}
              className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              style={{
                background: "none",
                border: "none",
                color: "var(--content-muted)",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: MONO,
              }}
            >
              close ×
            </button>
          }
        >
          {detailError ? (
            <div
              role="alert"
              className="rounded border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-fg)]"
            >
              {detailError}{" "}
              <button
                type="button"
                onClick={() => void openDetail(selected)}
                className="ml-2 min-h-11 rounded px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                Retry
              </button>
            </div>
          ) : detailLoading || !detail ? (
            <Empty label="loading…" />
          ) : (
            <div className="lg:grid lg:grid-cols-2 lg:gap-4">
              <div>
                <div className="eye" style={{ fontSize: 12, marginBottom: 6 }}>
                  RECENT FOOD LOGS
                </div>
                {detail.recentLogs.length === 0 ? (
                  <Empty label="no logs" />
                ) : (
                  <TableWrap maxHeight={260}>
                    <thead>
                      <tr>
                        <Th>Food</Th>
                        <Th right>kcal</Th>
                        <Th>Source</Th>
                        <Th right>Date</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recentLogs.map((l, i) => (
                        <tr key={i}>
                          <Td>{l.food_name}</Td>
                          <Td right mono>
                            {l.calories != null ? Math.round(l.calories) : "—"}
                          </Td>
                          <Td mono dim>
                            {l.source ?? "manual"}
                          </Td>
                          <Td right mono dim>
                            {l.logged_date}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </div>
              <div>
                <div
                  className="eye"
                  style={{ fontSize: 12, marginBottom: 6, marginTop: 0 }}
                >
                  AI SPEND BY TASK (ALL TIME)
                </div>
                {detail.spendByTask.length === 0 ? (
                  <Empty label="no AI usage" />
                ) : (
                  detail.spendByTask.map((s) => (
                    <div
                      key={s.task}
                      className="row-b"
                      style={{ marginBottom: 4 }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: MONO,
                          color: "var(--content-secondary)",
                        }}
                      >
                        {s.task}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: MONO,
                          color: "var(--content-primary)",
                        }}
                      >
                        {fmtUsd(s.cost, 3)} · {s.runs}
                      </span>
                    </div>
                  ))
                )}
                <div
                  className="eye"
                  style={{ fontSize: 12, margin: "12px 0 6px" }}
                >
                  RECENT AI RUNS
                </div>
                {detail.recentRuns.length === 0 ? (
                  <Empty label="no runs" />
                ) : (
                  <TableWrap maxHeight={200}>
                    <thead>
                      <tr>
                        <Th>Task</Th>
                        <Th right>Cost</Th>
                        <Th right>Latency</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recentRuns.map((r, i) => (
                        <tr key={i}>
                          <Td mono>{r.task}</Td>
                          <Td right mono>
                            {fmtUsd(r.cost, 4)}
                          </Td>
                          <Td right mono dim>
                            {fmtMs(r.latency_ms)}
                          </Td>
                          <Td>
                            <StatusChip status={r.status} />
                          </Td>
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

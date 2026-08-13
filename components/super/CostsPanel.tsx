"use client";

/**
 * AI Costs panel — spend, tokens, cache economics, latency percentiles.
 * Filters: window, groupBy, provider/model/task/status. Daily spend chart.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Panel,
  Kpi,
  Pills,
  Select,
  HBar,
  ColumnChart,
  StatusChip,
  TableWrap,
  Th,
  Td,
  Empty,
  fmtUsd,
  fmtNum,
  fmtMs,
  MONO,
} from "./ui";

interface CostsData {
  generatedAt: string;
  window: string;
  groupBy: string;
  totals: {
    runs?: number;
    cost?: number;
    tokens_in?: number;
    tokens_out?: number;
    cache_read?: number;
    cache_write?: number;
    failed?: number;
    fallbacks?: number;
    p50?: number | null;
    p95?: number | null;
    p99?: number | null;
  };
  breakdown: Array<{
    key: string;
    runs: number;
    cost: number;
    tokens_in: number;
    tokens_out: number;
    avg_latency: number | null;
    failed: number;
  }>;
  daily: Array<{ day: string; cost: number; runs: number }>;
  topRuns: Array<{
    id: string;
    task: string;
    model: string;
    cost: number;
    tokens_in: number;
    tokens_out: number;
    latency_ms: number | null;
    status: string;
    created_at: string;
  }>;
  facets: { providers: string[]; models: string[]; tasks: string[] };
}

const WINDOW_OPTS = [
  { v: "24h", label: "24H" },
  { v: "7d", label: "7D" },
  { v: "30d", label: "30D" },
  { v: "90d", label: "90D" },
  { v: "all", label: "ALL" },
] as const;

const GROUP_OPTS = [
  { v: "model", label: "MODEL" },
  { v: "provider", label: "PROVIDER" },
  { v: "task", label: "TASK" },
  { v: "user", label: "USER" },
  { v: "status", label: "STATUS" },
] as const;

export default function CostsPanel() {
  const [data, setData] = useState<CostsData | null>(null);
  const [win, setWin] = useState<string>(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("cc_costs_window") ?? "7d")
      : "7d",
  );
  const [groupBy, setGroupBy] = useState<string>("model");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    const q = new URLSearchParams({ window: win, groupBy });
    if (provider) q.set("provider", provider);
    if (model) q.set("model", model);
    if (task) q.set("task", task);
    try {
      const res = await fetch(`/api/super/costs?${q}`);
      // Ignore a stale response: a slow earlier filter must not overwrite the
      // newer one (the 7d aggregate can outrun a later 24h click).
      if (seq !== reqSeq.current) return;
      if (!res.ok) throw new Error(`Unable to load costs (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch {
      if (seq === reqSeq.current) {
        setData(null);
        setError("Unable to load costs.");
      }
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [win, groupBy, provider, model, task]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    localStorage.setItem("cc_costs_window", win);
  }, [win]);

  const t = data?.totals ?? {};
  const cacheRate =
    (t.tokens_in ?? 0) > 0
      ? ((t.cache_read ?? 0) / (t.tokens_in! + (t.cache_read ?? 0))) * 100
      : 0;
  const failRate = (t.runs ?? 0) > 0 ? ((t.failed ?? 0) / t.runs!) * 100 : 0;
  const maxBreakdownCost = Math.max(
    ...(data?.breakdown ?? []).map((b) => b.cost),
    0.0001,
  );
  // First load: show honest loading placeholders, not misleading zero-spend KPIs.
  // (The 7d aggregate over agent_runs can take a second or two.)
  const emptyLabel = data ? "no runs in window" : "loading…";

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
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Pills options={[...WINDOW_OPTS]} value={win} onChange={setWin} />
        <Pills
          options={[...GROUP_OPTS]}
          value={groupBy}
          onChange={setGroupBy}
          small
        />
        <Select
          value={provider}
          onChange={setProvider}
          options={data?.facets.providers ?? []}
          allLabel="all providers"
        />
        <Select
          value={model}
          onChange={setModel}
          options={data?.facets.models ?? []}
          allLabel="all models"
        />
        <Select
          value={task}
          onChange={setTask}
          options={data?.facets.tasks ?? []}
          allLabel="all tasks"
        />
        {loading && (
          <span className="ds-sub" style={{ fontSize: 12, fontFamily: MONO }}>
            loading…
          </span>
        )}
      </div>

      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Kpi
          label={`Spend · ${win}`}
          value={data ? fmtUsd(t.cost) : "…"}
          accent
          sub={data ? `${fmtNum(t.runs)} runs` : undefined}
        />
        <Kpi
          label="Tokens in / out"
          value={
            data ? `${fmtNum(t.tokens_in)} / ${fmtNum(t.tokens_out)}` : "…"
          }
        />
        <Kpi
          label="Cache hit"
          value={data ? `${cacheRate.toFixed(1)}%` : "…"}
          sub={data ? `${fmtNum(t.cache_read)} cached tok` : undefined}
        />
        <Kpi
          label="Failure rate"
          value={data ? `${failRate.toFixed(1)}%` : "…"}
          warn={failRate > 5}
          sub={
            data
              ? `${t.failed ?? 0} failed · ${t.fallbacks ?? 0} fallbacks`
              : undefined
          }
        />
        <Kpi
          label="Latency p50 / p95 / p99"
          value={
            data ? `${fmtMs(t.p50)} / ${fmtMs(t.p95)} / ${fmtMs(t.p99)}` : "…"
          }
        />
        <Kpi
          label="Cost per run"
          value={
            data
              ? fmtUsd((t.runs ?? 0) > 0 ? (t.cost ?? 0) / t.runs! : 0, 4)
              : "…"
          }
        />
      </div>

      {/* Daily spend chart */}
      <Panel
        title={`DAILY SPEND · ${win}`}
        meta={
          <span className="ds-sub" style={{ fontSize: 12, fontFamily: MONO }}>
            {data?.daily.length ?? 0} days
          </span>
        }
      >
        {data && data.daily.length > 0 ? (
          <ColumnChart
            points={data.daily.map((d) => ({ label: d.day, value: d.cost }))}
            format={(v) => fmtUsd(v, 3)}
          />
        ) : (
          <Empty label={emptyLabel} />
        )}
      </Panel>

      {/* Breakdown */}
      <Panel title={`SPEND BY ${groupBy.toUpperCase()}`}>
        {(data?.breakdown ?? []).length === 0 ? (
          <Empty label={data ? "no data" : "loading…"} />
        ) : (
          <div>
            {(data?.breakdown ?? []).map((b) => (
              <HBar
                key={b.key}
                label={b.key}
                value={b.cost}
                max={maxBreakdownCost}
                display={`${fmtUsd(b.cost, 3)} · ${fmtNum(b.runs)}`}
                color={
                  b.failed > 0 && b.failed / b.runs > 0.1
                    ? "var(--status-danger-fg)"
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Most expensive runs */}
      <Panel title="MOST EXPENSIVE RUNS">
        {(data?.topRuns ?? []).length === 0 ? (
          <Empty label={data ? "no runs" : "loading…"} />
        ) : (
          <TableWrap maxHeight={320}>
            <thead>
              <tr>
                <Th>Task</Th>
                <Th>Model</Th>
                <Th right>Cost</Th>
                <Th right>Tok in/out</Th>
                <Th right>Latency</Th>
                <Th>Status</Th>
                <Th right>When</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.topRuns ?? []).map((r) => (
                <tr key={r.id}>
                  <Td mono>{r.task}</Td>
                  <Td mono dim>
                    {r.model}
                  </Td>
                  <Td right mono>
                    {fmtUsd(r.cost, 4)}
                  </Td>
                  <Td right mono dim>
                    {fmtNum(r.tokens_in)}/{fmtNum(r.tokens_out)}
                  </Td>
                  <Td right mono>
                    {fmtMs(r.latency_ms)}
                  </Td>
                  <Td>
                    <StatusChip status={r.status} />
                  </Td>
                  <Td right mono dim>
                    {new Date(r.created_at).toLocaleString()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

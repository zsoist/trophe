"use client";

/**
 * Runs panel — live agent_runs feed with status/task/model filters,
 * pagination, and expandable full error messages.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Panel,
  Pills,
  Select,
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

interface RunRow {
  id: string;
  task: string;
  provider: string | null;
  model: string;
  status: string;
  cost: number;
  tokens_in: number;
  tokens_out: number;
  cache_read: number;
  latency_ms: number | null;
  fallback_from: string | null;
  error: string | null;
  user_id: string | null;
  created_at: string;
}

const WINDOW_OPTS = [
  { v: "24h", label: "24H" },
  { v: "7d", label: "7D" },
  { v: "30d", label: "30D" },
  { v: "all", label: "ALL" },
] as const;

const STATUS_OPTS = [
  { v: "", label: "ALL" },
  { v: "completed", label: "OK" },
  { v: "failed", label: "FAILED" },
] as const;

const PAGE = 50;

export default function RunsPanel({
  facets,
}: {
  facets?: { models: string[]; tasks: string[] };
}) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [total, setTotal] = useState(0);
  const [win, setWin] = useState("24h");
  const [status, setStatus] = useState("");
  const [task, setTask] = useState("");
  const [model, setModel] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    const q = new URLSearchParams({
      window: win,
      limit: String(PAGE),
      offset: String(offset),
    });
    if (status) q.set("status", status);
    if (task) q.set("task", task);
    if (model) q.set("model", model);
    try {
      const res = await fetch(`/api/super/runs?${q}`);
      if (request !== requestSequence.current) return;
      if (res.ok) {
        const d = await res.json();
        if (request !== requestSequence.current) return;
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setError(null);
      } else throw new Error();
    } catch {
      if (request !== requestSequence.current) return;
      setRows([]);
      setTotal(0);
      setError("Unable to load runs.");
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [win, status, task, model, offset]);

  useEffect(() => {
    load();
  }, [load]);
  // Reset paging whenever a filter changes
  useEffect(() => {
    setOffset(0);
  }, [win, status, task, model]);

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
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Pills options={[...WINDOW_OPTS]} value={win} onChange={setWin} />
        <Pills
          options={[...STATUS_OPTS]}
          value={status}
          onChange={setStatus}
          small
        />
        <Select
          value={task}
          onChange={setTask}
          options={facets?.tasks ?? []}
          allLabel="all tasks"
        />
        <Select
          value={model}
          onChange={setModel}
          options={facets?.models ?? []}
          allLabel="all models"
        />
        {loading && (
          <span className="ds-sub" style={{ fontSize: 12, fontFamily: MONO }}>
            loading…
          </span>
        )}
      </div>

      <Panel
        title={`RUNS · ${fmtNum(total)}`}
        meta={
          <div className="row-i" style={{ gap: 6 }}>
            <button
              disabled={offset === 0}
              className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
              style={{
                background: "none",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                color:
                  offset === 0
                    ? "var(--content-muted)"
                    : "var(--content-primary)",
                fontSize: 12,
                fontFamily: MONO,
                padding: "2px 8px",
                cursor: offset === 0 ? "default" : "pointer",
              }}
            >
              prev
            </button>
            <span className="ds-sub" style={{ fontSize: 12, fontFamily: MONO }}>
              {offset + 1}–{Math.min(offset + PAGE, total)}
            </span>
            <button
              disabled={offset + PAGE >= total}
              className="min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              onClick={() => setOffset(offset + PAGE)}
              style={{
                background: "none",
                border: "1px solid var(--border-default)",
                borderRadius: 6,
                color:
                  offset + PAGE >= total
                    ? "var(--content-muted)"
                    : "var(--content-primary)",
                fontSize: 12,
                fontFamily: MONO,
                padding: "2px 8px",
                cursor: offset + PAGE >= total ? "default" : "pointer",
              }}
            >
              next
            </button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <Empty label={loading ? "loading…" : "no runs match"} />
        ) : (
          <TableWrap maxHeight={560}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Task</Th>
                <Th>Model</Th>
                <Th>Status</Th>
                <Th right>Cost</Th>
                <Th right>Tok in/out</Th>
                <Th right>Cache</Th>
                <Th right>Latency</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <Td mono dim>
                      {new Date(r.created_at).toLocaleTimeString()}{" "}
                      <span style={{ opacity: 0.6 }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </Td>
                    <Td mono>{r.task}</Td>
                    <Td mono dim>
                      {r.model}
                      {r.fallback_from ? " *" : ""}
                    </Td>
                    <Td>
                      <StatusChip status={r.status} />
                    </Td>
                    <Td right mono>
                      {fmtUsd(r.cost, 4)}
                    </Td>
                    <Td right mono dim>
                      {fmtNum(r.tokens_in)}/{fmtNum(r.tokens_out)}
                    </Td>
                    <Td right mono dim>
                      {r.cache_read > 0 ? fmtNum(r.cache_read) : "—"}
                    </Td>
                    <Td right mono>
                      {fmtMs(r.latency_ms)}
                    </Td>
                    <Td>
                      {(r.error || r.fallback_from) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded(expanded === r.id ? null : r.id)
                          }
                          aria-expanded={expanded === r.id}
                          aria-controls={`run-detail-${r.id}`}
                          className="min-h-11 whitespace-nowrap rounded px-2 text-xs text-[var(--action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        >
                          {expanded === r.id
                            ? "Collapse details"
                            : "Expand details"}
                        </button>
                      )}
                    </Td>
                  </tr>
                  {expanded === r.id && (r.error || r.fallback_from) && (
                    <tr id={`run-detail-${r.id}`}>
                      <Td
                        colSpan={9}
                        style={{
                          maxWidth: "none",
                          whiteSpace: "normal",
                          background: "var(--status-danger-bg)",
                        }}
                      >
                        {r.fallback_from && (
                          <div
                            style={{
                              fontSize: 12,
                              fontFamily: MONO,
                              color: "var(--status-warning-fg)",
                              marginBottom: 4,
                            }}
                          >
                            fallback: {r.fallback_from} → {r.model}
                          </div>
                        )}
                        {r.error && (
                          <div
                            style={{
                              fontSize: 12,
                              fontFamily: MONO,
                              color: "var(--status-danger-fg)",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
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

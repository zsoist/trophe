"use client";

/**
 * Command Center UI primitives — dense, monospace-accented, zero emojis.
 * Pure CSS/SVG visuals (no chart library: the operations console must not
 * add bundle weight to the app it monitors).
 */

import { type ReactNode } from "react";

export const MONO = "var(--font-mono), ui-monospace, monospace";
export const GOLD = "var(--action-primary)";
// The global stylesheet consumes this same prefers-reduced-motion contract.
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtUsd(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "$0.00";
  if (v > 0 && v < 0.01 && digits === 2) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(digits)}`;
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "0";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toLocaleString();
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 86400 / 30)}mo ago`;
}

// ─── Layout primitives ────────────────────────────────────────────────────────

export function Panel({
  title,
  meta,
  children,
  style,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12, ...style }}>
      <div
        className="row-b"
        style={{ marginBottom: 10, alignItems: "baseline" }}
      >
        <span className="eye" style={{ letterSpacing: ".08em" }}>
          {title}
        </span>
        {meta}
      </div>
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  accent,
  warn,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  warn?: boolean;
}) {
  const color = warn
    ? "var(--status-danger-fg)"
    : accent
      ? GOLD
      : "var(--content-primary)";
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        minWidth: 0,
        background: accent ? "var(--surface-active)" : "var(--surface-2)",
        border: `1px solid ${accent ? "var(--action-primary)" : "var(--border-default)"}`,
      }}
    >
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color,
          fontFamily: MONO,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      <div
        className="ds-sub"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          marginTop: 2,
        }}
      >
        {label}
      </div>
      {sub != null && (
        <div
          className="ds-sub"
          style={{ fontSize: 12, marginTop: 1, fontFamily: MONO }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** Pill-style toggle group used for every filter. */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  small,
  tabs,
  onKeyDown,
}: {
  options: Array<{ v: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
  tabs?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>, value: T) => void;
}) {
  return (
    <div
      role={tabs ? "tablist" : undefined}
      aria-label={tabs ? "Operations sections" : undefined}
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 2,
        background: "var(--surface-2)",
        borderRadius: 8,
        padding: 2,
        border: "1px solid var(--border-default)",
      }}
    >
      {options.map((o) => (
        <button
          key={o.v}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          onClick={() => onChange(o.v)}
          onKeyDown={(event) => onKeyDown?.(event, o.v)}
          role={tabs ? "tab" : undefined}
          aria-selected={tabs ? value === o.v : undefined}
          aria-controls={tabs ? `super-panel-${o.v}` : undefined}
          id={tabs ? `super-tab-${o.v}` : undefined}
          tabIndex={tabs ? (value === o.v ? 0 : -1) : undefined}
          style={{
            minHeight: 44,
            padding: small ? "3px 8px" : "4px 10px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: MONO,
            fontWeight: 600,
            background: value === o.v ? "var(--surface-active)" : "transparent",
            color: value === o.v ? GOLD : "var(--content-muted)",
            transition: "color .15s, background .15s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Native select styled to match — used when option lists are dynamic. */
export function Select({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        minHeight: 44,
        padding: "4px 8px",
        borderRadius: 8,
        fontSize: 16,
        fontFamily: MONO,
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        color: value ? GOLD : "var(--content-muted)",
        cursor: "pointer",
        maxWidth: 150,
      }}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** Horizontal CSS bar — value vs max, with label + right-aligned figure. */
export function HBar({
  label,
  value,
  max,
  display,
  color,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  color?: string;
}) {
  return (
    <div className="row-b" style={{ marginBottom: 5, gap: 10 }}>
      <span
        style={{
          fontSize: 12,
          color: "var(--content-secondary)",
          fontFamily: MONO,
          minWidth: 0,
          overflowWrap: "anywhere",
          flex: "0 1 auto",
        }}
      >
        {label}
      </span>
      <div
        className="row-i"
        style={{ gap: 8, flex: "1 0 auto", justifyContent: "flex-end" }}
      >
        <div
          style={{
            width: "min(110px, 24vw)",
            height: 5,
            borderRadius: 3,
            background: "var(--surface-2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`,
              height: "100%",
              background: color ?? GOLD,
              opacity: 0.75,
              borderRadius: 3,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            color: "var(--content-primary)",
            fontFamily: MONO,
            minWidth: 64,
            textAlign: "right",
          }}
        >
          {display}
        </span>
      </div>
    </div>
  );
}

/** Daily column chart (pure CSS flexbox) with hover titles. */
export function ColumnChart({
  points,
  height = 72,
  format,
}: {
  points: Array<{ label: string; value: number }>;
  height?: number;
  format: (v: number) => string;
}) {
  const max = Math.max(...points.map((p) => p.value), 0.0001);
  return (
    <div
      role="img"
      aria-label="Operations data chart"
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        height,
        marginTop: 4,
      }}
    >
      {points.map((p) => (
        <div
          key={p.label}
          title={`${p.label} — ${format(p.value)}`}
          style={{
            flex: 1,
            minWidth: 2,
            borderRadius: "2px 2px 0 0",
            height: `${Math.max(2, (p.value / max) * 100)}%`,
            background: "var(--data-calories)",
            opacity: p.value === 0 ? 0.12 : 0.55,
            transition: "opacity .15s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.opacity =
              p.value === 0 ? "0.12" : "0.55";
          }}
        />
      ))}
    </div>
  );
}

/** Status chip: completed → muted, failed → red, else amber. */
export function StatusChip({ status }: { status: string }) {
  const failed = status === "failed" || status === "error";
  const ok = status === "completed";
  return (
    <span
      style={{
        fontSize: 12,
        fontFamily: MONO,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 6,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: failed
          ? "var(--status-danger-fg)"
          : ok
            ? "var(--content-muted)"
            : "var(--status-warning-fg)",
        background: failed
          ? "var(--status-danger-surface)"
          : ok
            ? "var(--surface-2)"
            : "var(--surface-active)",
        border: `1px solid ${failed ? "var(--status-danger-border)" : ok ? "var(--border-default)" : "var(--action-primary)"}`,
      }}
    >
      {status}
    </span>
  );
}

/** Role chip with weight-coded color. */
export function RoleChip({ role }: { role: string }) {
  const colors: Record<string, string> = {
    super_admin: GOLD,
    admin: "var(--status-info-fg)",
    coach: "var(--status-success-fg)",
    client: "var(--content-muted)",
  };
  return (
    <span
      style={{
        fontSize: 12,
        fontFamily: MONO,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 6,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: colors[role] ?? "var(--content-muted)",
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
      }}
    >
      {role}
    </span>
  );
}

// ─── Table primitives ─────────────────────────────────────────────────────────

export function Th({
  children,
  right,
  onClick,
  active,
}: {
  children: ReactNode;
  right?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: right ? "right" : "left",
        padding: "6px 8px",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: ".06em",
        fontFamily: MONO,
        color: active ? GOLD : "var(--content-muted)",
        fontWeight: 600,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        borderBottom: "1px solid var(--border-default)",
        position: "sticky",
        top: 0,
        background: "var(--canvas)",
      }}
    >
      {children}
      {active ? " ↓" : ""}
    </th>
  );
}

export function Td({
  children,
  right,
  mono,
  dim,
  style,
  colSpan,
}: {
  children: ReactNode;
  right?: boolean;
  mono?: boolean;
  dim?: boolean;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: right ? "right" : "left",
        padding: "7px 8px",
        fontSize: 12,
        fontFamily: mono ? MONO : undefined,
        color: dim ? "var(--content-muted)" : "var(--content-primary)",
        borderBottom: "1px solid var(--surface-2)",
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        maxWidth: 260,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

export function TableWrap({
  children,
  maxHeight = 480,
}: {
  children: ReactNode;
  maxHeight?: number;
}) {
  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "auto",
        maxHeight,
        borderRadius: 10,
        border: "1px solid var(--border-default)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        {children}
      </table>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return (
    <div
      className="ds-sub"
      style={{
        fontSize: 12,
        padding: "18px 0",
        textAlign: "center",
        fontFamily: MONO,
      }}
    >
      {label}
    </div>
  );
}

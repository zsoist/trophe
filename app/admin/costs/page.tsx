"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Clock, DollarSign, TrendingUp, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface CostSummary {
  totalCost: number;
  totalCalls: number;
  byEndpoint: Record<string, { calls: number; cost: number }>;
  byModel: Record<string, { calls: number; cost: number }>;
  byDay: { date: string; cost: number; calls: number }[];
  avgCostPerCall: number;
  avgLatency: number;
  latency: { p50: number; p95: number; p99: number };
  budget?: {
    monthlyBudgetUsd: number;
    projectedMonthlyCost: number;
    overBudget: boolean;
  };
  reliability?: {
    failedCalls: number;
    pendingCalls: number;
    fallbackCalls: number;
    missingCostAttribution: number;
    failureRate: number;
    fallbackRate: number;
    cacheReadRate: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

const cardClass =
  "rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-low)]";

export default function CostDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role !== "admin" && profile?.role !== "super_admin") {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/costs?days=${period}`, {
        headers: sessionData.session?.access_token
          ? { Authorization: `Bearer ${sessionData.session.access_token}` }
          : undefined,
      });
      if (!response.ok) {
        router.push("/dashboard");
        return;
      }
      setSummary((await response.json()) as CostSummary);
      setLoading(false);
    };
    void init();
  }, [period, router]);
  if (!authorized) return null;
  const maxDayCost = summary
    ? Math.max(...summary.byDay.map((day) => day.cost), 0.01)
    : 1;
  const dailyBudget = 0.5;
  const metrics = [
    {
      label: "Total cost",
      value: `$${summary?.totalCost.toFixed(4) ?? "0.0000"}`,
      detail: summary
        ? `$${((summary.totalCost / period) * 30).toFixed(2)}/month projected`
        : "",
      Icon: DollarSign,
      color: "var(--data-calories)",
    },
    {
      label: "API calls",
      value: summary?.totalCalls ?? "0",
      detail: summary
        ? `${(summary.totalCalls / period).toFixed(1)}/day average`
        : "",
      Icon: Zap,
      color: "var(--data-neutral)",
    },
    {
      label: "Average latency",
      value: summary ? `${Math.round(summary.avgLatency)}ms` : "—",
      detail: summary
        ? `${(summary.avgLatency / 1000).toFixed(1)}s per call`
        : "",
      Icon: Clock,
      color: "var(--status-info-fg)",
    },
    {
      label: "Cost per call",
      value: summary ? `$${summary.avgCostPerCall.toFixed(5)}` : "—",
      detail: summary
        ? summary.avgCostPerCall < 0.001
          ? "Very efficient"
          : summary.avgCostPerCall < 0.01
            ? "Normal"
            : "High"
        : "",
      Icon: TrendingUp,
      color: "var(--status-success-fg)",
    },
  ];
  return (
    <main
      data-admin-costs-reflow
      className="min-h-screen bg-[var(--canvas)] px-4 py-8 text-[var(--content-primary)]"
    >
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--content-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">API Cost Tracker</h1>
          <div className="ml-auto flex flex-wrap gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => {
                  setPeriod(days);
                  setLoading(true);
                }}
                className={`min-h-11 rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${period === days ? "border-[var(--action-primary)] bg-[var(--surface-active)] text-[var(--action-primary)]" : "border-[var(--border-default)] text-[var(--content-secondary)]"}`}
              >
                {days}d
              </button>
            ))}
          </div>
        </header>
        {loading ? (
          <div className={cardClass}>Loading…</div>
        ) : !summary || !summary.totalCalls ? (
          <div className={cardClass}>
            No API usage data yet. Costs will appear once users start parsing
            food or analyzing photos.
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map(({ label, value, detail, Icon, color }) => (
                <article key={label} className={cardClass}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-[var(--content-secondary)]">
                    <Icon size={16} style={{ color }} />
                    {label}
                  </div>
                  <p className="text-2xl font-bold" style={{ color }}>
                    {value}
                  </p>
                  <p className="mt-1 text-xs text-[var(--content-muted)]">
                    {detail}
                  </p>
                </article>
              ))}
            </section>
            {(summary.totalCost / period > dailyBudget ||
              summary.budget?.overBudget) && (
              <section className="mt-4 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-surface)] p-4 text-sm text-[var(--status-danger-fg)]">
                {summary.budget?.overBudget
                  ? `Projected monthly AI spend ($${summary.budget.projectedMonthlyCost.toFixed(2)}) exceeds $${summary.budget.monthlyBudgetUsd.toFixed(2)} budget`
                  : `Daily average ($${(summary.totalCost / period).toFixed(3)}) exceeds $${dailyBudget}/day budget`}
              </section>
            )}
            <section className={`${cardClass} mt-4`}>
              <h2 className="mb-3 text-sm font-semibold">Daily cost</h2>
              <div
                role="img"
                aria-label="Daily API cost chart"
                className="relative flex h-28 items-end gap-1"
              >
                {summary.byDay.slice(-Math.min(period, 30)).map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: $${day.cost.toFixed(4)} (${day.calls} calls)`}
                    className="min-w-0 flex-1 rounded-t bg-[var(--data-calories)] motion-reduce:transition-none"
                    style={{
                      height: `${Math.max(2, (day.cost / Math.max(maxDayCost, dailyBudget)) * 100)}%`,
                    }}
                  />
                ))}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--status-danger-border)]"
                  style={{
                    bottom: `${(dailyBudget / Math.max(maxDayCost, dailyBudget)) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--content-muted)]">
                Red dashed Budget reference: ${dailyBudget}/day.
              </p>
            </section>
            <section className={`${cardClass} mt-4`}>
              <h2 className="mb-3 text-sm font-semibold">AI Reliability</h2>
              {summary.reliability && (
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-[var(--content-secondary)]">
                      Failure rate
                    </dt>
                    <dd>
                      {(summary.reliability.failureRate * 100).toFixed(1)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--content-secondary)]">
                      Fallback rate
                    </dt>
                    <dd>
                      {(summary.reliability.fallbackRate * 100).toFixed(1)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--content-secondary)]">
                      Pending runs
                    </dt>
                    <dd>{summary.reliability.pendingCalls}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--content-secondary)]">
                      Missing costs
                    </dt>
                    <dd>{summary.reliability.missingCostAttribution}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--content-secondary)]">
                      Cache read rate
                    </dt>
                    <dd>
                      {(summary.reliability.cacheReadRate * 100).toFixed(1)}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--content-secondary)]">
                      Failed runs
                    </dt>
                    <dd>{summary.reliability.failedCalls}</dd>
                  </div>
                </dl>
              )}
              <h2 className="mb-3 mt-5 text-sm font-semibold">
                Latency Percentiles
              </h2>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-[var(--content-secondary)]">p50</dt>
                  <dd>{summary.latency.p50}ms</dd>
                </div>
                <div>
                  <dt className="text-[var(--content-secondary)]">p95</dt>
                  <dd>{summary.latency.p95}ms</dd>
                </div>
                <div>
                  <dt className="text-[var(--content-secondary)]">p99</dt>
                  <dd>{summary.latency.p99}ms</dd>
                </div>
              </dl>
            </section>
            <section className={`${cardClass} mt-4`}>
              <h2 className="mb-3 text-sm font-semibold">Cost by endpoint</h2>
              <div className="space-y-3">
                {Object.entries(summary.byEndpoint)
                  .sort(([, a], [, b]) => b.cost - a.cost)
                  .map(([endpoint, data]) => {
                    const pct = summary.totalCost
                      ? (data.cost / summary.totalCost) * 100
                      : 0;
                    return (
                      <div key={endpoint}>
                        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                          <span className="min-w-0 break-all text-[var(--content-secondary)]">
                            {endpoint}
                          </span>
                          <span className="text-[var(--content-primary)]">
                            ${data.cost.toFixed(4)} ({data.calls})
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                          <div
                            className="h-full rounded-full bg-[var(--data-calories)] motion-reduce:transition-none"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
            <section className={`${cardClass} mt-4`}>
              <h2 className="mb-3 text-sm font-semibold">Cost by Model</h2>
              <dl className="space-y-2">
                {Object.entries(summary.byModel)
                  .sort(([, a], [, b]) => b.cost - a.cost)
                  .map(([model, data]) => (
                    <div
                      key={model}
                      className="flex flex-wrap justify-between gap-x-4 gap-y-1"
                    >
                      <dt className="break-all text-sm text-[var(--content-secondary)]">
                        {model}
                      </dt>
                      <dd className="text-sm">
                        ${data.cost.toFixed(4)} ({data.calls})
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
            <section className={`${cardClass} mt-4`}>
              <h2 className="mb-3 text-sm font-semibold">Optimization Notes</h2>
              <div className="space-y-2 text-sm text-[var(--content-secondary)]">
                {summary.byEndpoint["/api/ai/photo-analyze"] &&
                  summary.byEndpoint["/api/food/parse"] && (
                    <p>
                      Photo analysis costs{" "}
                      {(
                        summary.byEndpoint["/api/ai/photo-analyze"].cost /
                        Math.max(
                          summary.byEndpoint["/api/food/parse"].cost,
                          0.0001,
                        )
                      ).toFixed(1)}
                      x more than text parsing per call. Encourage text input
                      for lower costs.
                    </p>
                  )}
                <p>
                  At current rate: ~$
                  {((summary.totalCost / period) * 365).toFixed(2)}/year.
                  {(summary.totalCost / period) * 365 < 10
                    ? " Very sustainable."
                    : " Consider caching frequent queries."}
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

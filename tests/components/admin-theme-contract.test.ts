import { readFileSync } from "node:fs";
import { join } from "node:path";
// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnChart, Th } from "@/components/super/ui";
import RunsPanel from "@/components/super/RunsPanel";

vi.mock("next/link", async () => {
  const react = await import("react");
  return {
    default: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
      react.createElement("a", props, children),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ADMIN_THEME_SOURCES = [
  "app/admin/orgs/page.tsx",
  "app/admin/costs/page.tsx",
  "app/super/page.tsx",
  "components/super/AuditPanel.tsx",
  "components/super/CostsPanel.tsx",
  "components/super/RunsPanel.tsx",
  "components/super/UsersPanel.tsx",
  "components/super/ui.tsx",
  "components/admin/PrivacyRequests.tsx",
] as const;

const source = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8");
const inventory = (patterns: readonly RegExp[]) =>
  ADMIN_THEME_SOURCES.flatMap((file) =>
    patterns.flatMap((pattern) =>
      (source(file).match(pattern) ?? []).map((match) => `${file}: ${match}`),
    ),
  );
const declaredTokens = new Set(
  source("app/globals.css").match(/--[a-z0-9-]+(?=:\s)/g) ?? [],
);
const globalStyles = source("app/globals.css");
const darkThemeTokens = globalStyles.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const lightThemeTokens = globalStyles.match(/\.light\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const rosterUser = (id: string, name: string) => ({
  id,
  email: `${id}@example.com`,
  full_name: name,
  role: "client",
  created_at: new Date().toISOString(),
  last_sign_in_at: null,
  logs_total: 0,
  logs_30d: 0,
  last_log_at: null,
  ai_cost_30d: 0,
  ai_runs_30d: 0,
  messages_30d: 0,
  workouts_30d: 0,
});

const userDetail = (task: string) => ({
  recentLogs: [],
  recentRuns: [],
  spendByTask: [{ task, cost: 0.1, runs: 1 }],
});

describe("admin and super-admin theme and accessibility contract", () => {
  it("uses semantic roles instead of dark-only, white-alpha, or raw rgba recipes", () => {
    const forbidden = [
      /(?:bg|border|text)-stone-(?:[1-9]\d\d|950)(?:\/[\d.]+)?/g,
      /(?:bg|border)-white\/(?:\[|\d)/g,
      /rgba\(/g,
      /var\(--(?:t[1-6]|line(?:-2)?|bg(?:-1)?)(?:[,\)])/g,
      /#[0-9a-f]{3,8}\b/gi,
    ];

    expect(inventory(forbidden)).toEqual([]);
    for (const file of ADMIN_THEME_SOURCES)
      expect(source(file), file).toMatch(
        /var\(--(?:canvas|surface|content|border|action|status|data)-/,
      );
  });

  it("references only globally declared semantic tokens", () => {
    const missing = ADMIN_THEME_SOURCES.flatMap((file) =>
      [...source(file).matchAll(/var\((--[a-z0-9-]+)/g)]
        .map((match) => match[1])
        .filter((token) => !declaredTokens.has(token))
        .map((token) => `${file}: ${token}`),
    );
    expect(missing).toEqual([]);
  });

  it("declares every referenced status token in both light and dark themes", () => {
    const referencedStatusTokens = new Set(
      ADMIN_THEME_SOURCES.flatMap((file) =>
        [...source(file).matchAll(/var\((--status-[a-z]+-(?:bg|border|fg))/g)].map(
          (match) => match[1],
        ),
      ),
    );

    for (const token of referencedStatusTokens) {
      expect(darkThemeTokens, `dark theme: ${token}`).toContain(`${token}:`);
      expect(lightThemeTokens, `light theme: ${token}`).toContain(`${token}:`);
    }
  });

  it("exposes native controls for operations table interactions", () => {
    const ui = source("components/super/ui.tsx");
    const users = source("components/super/UsersPanel.tsx");
    const runs = source("components/super/RunsPanel.tsx");
    expect(ui).toContain("aria-sort");
    expect(ui).toContain("<button");
    expect(users).toContain("View details");
    expect(runs).toContain("aria-expanded");
    expect(runs).toContain("aria-controls");
  });

  it("provides textual chart values alongside visual operations charts", () => {
    const ui = source("components/super/ui.tsx");
    const costs = source("app/admin/costs/page.tsx");
    expect(ui).toContain("sr-only");
    expect(costs).toContain("sr-only");
  });

  it("recovers operations fetch failures with an alert and retry", () => {
    for (const file of [
      "app/super/page.tsx",
      "components/super/CostsPanel.tsx",
      "components/super/RunsPanel.tsx",
      "components/super/UsersPanel.tsx",
      "components/super/AuditPanel.tsx",
    ]) {
      const value = source(file);
      expect(value, file).toContain('role="alert"');
      expect(value, file).toContain("Retry");
    }
  });

  it("keeps functional text at 12px or larger and mobile text controls at 16px", () => {
    const forbidden = [
      /text-\[(?:8|9|10|11)px\]/g,
      /fontSize:\s*(?:[89]|10|11)(?:\.\d+)?(?:[,}])/g,
    ];
    expect(inventory(forbidden)).toEqual([]);

    const controls = ADMIN_THEME_SOURCES.flatMap((file) =>
      [
        ...(source(file).match(/<(?:input|textarea)\b[\s\S]*?\/>/g) ?? []),
        ...(source(file).match(/<select\b[\s\S]*?<\/select>/g) ?? []),
      ].map((element) => ({ file, element })),
    );
    const undersized = controls.filter(
      ({ element }) =>
        !/type="(?:checkbox|file|hidden|range|radio)"/.test(element) &&
        !/(?:text-base|text-\[16px\]|fontSize:\s*(?:1[6-9]|[2-9]\d))/.test(
          element,
        ),
    );

    expect(undersized).toEqual([]);
  });

  it("keeps the organizations table desktop-only and renders the complete mobile definition-list cards", () => {
    const orgs = source("app/admin/orgs/page.tsx");
    expect(orgs).toContain("data-admin-org-mobile-cards");
    expect(orgs).toMatch(
      /<dl[\s\S]*?Org[\s\S]*?Plan[\s\S]*?Subscription[\s\S]*?Billing[\s\S]*?Status[\s\S]*?Actions/,
    );
    expect(orgs).toMatch(
      /Actions[\s\S]*?href="\/admin\/costs"[\s\S]*?min-h-11/,
    );
    expect(orgs).toMatch(/hidden\s+md:block[\s\S]*?<table/);
    expect(orgs).toMatch(/(?:break-all|break-words)/);
    expect(orgs).not.toMatch(/overflow-hidden[\s\S]*?<table/);
  });

  it("keeps operations actions reachable with named 44px focus-visible controls", () => {
    for (const file of ADMIN_THEME_SOURCES) {
      const value = source(file);
      const buttons = value.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
      const links = value.match(/<(?:Link|a)\b[\s\S]*?<\/(?:Link|a)>/g) ?? [];
      const controls = [...buttons, ...links];
      const violations = controls.filter(
        (control) =>
          !/(?:min-h-11|h-11|minHeight:\s*44)/.test(control) ||
          !/(?:focus-visible:|onFocus=)/.test(control) ||
          (!/[A-Za-z]{2,}/.test(control.replace(/<[^>]+>/g, "")) &&
            !/aria-label=/.test(control)),
      );
      expect(
        violations.map((control) => `${file}: ${control.slice(0, 140)}`),
      ).toEqual([]);
    }
  });

  it("uses responsive, reduced-motion operations charts and keyboard tabs with panels", () => {
    const costs = source("app/admin/costs/page.tsx");
    const superPage = source("app/super/page.tsx");
    const superUi = source("components/super/ui.tsx");

    expect(costs).toContain("data-admin-costs-reflow");
    expect(costs).toContain("AI Reliability");
    expect(costs).toContain("Latency Percentiles");
    expect(costs).toContain("Optimization Notes");
    expect(costs).toContain("Cache read rate");
    expect(costs).toContain("Missing costs");
    expect(costs).toContain("Budget reference");
    expect(costs).toContain("border-dashed");
    expect(costs).toContain("Cost by Model");
    expect(costs).toContain("motion-reduce:transition-none");
    expect(costs).toMatch(/(?:break-all|break-words)/);
    expect(superUi).toMatch(/role=\{tabs \? ["']tablist["']/);
    expect(superUi).toMatch(/role=\{tabs \? ["']tab["']/);
    expect(superUi).toMatch(/aria-selected/);
    expect(superPage).toMatch(/role="tabpanel"/);
    expect(superPage).toContain("onKeyDown");
    expect(superPage).toMatch(/event\.key === ["']Home["']/);
    expect(superPage).toMatch(/event\.key === ["']End["']/);
    expect(superUi).toContain(
      "tabIndex={tabs ? (value === o.v ? 0 : -1) : undefined}",
    );
    expect(superUi).toContain("var(--data-");
    expect(superUi).toMatch(/transition:[\s\S]*?motion-reduce:transition-none/);
  });

  it("renders named privacy actions and semantic request statuses", () => {
    const privacy = source("components/admin/PrivacyRequests.tsx");
    expect(privacy).toMatch(/<button[\s\S]*?Request export/);
    expect(privacy).toMatch(/<button[\s\S]*?Request deletion/);
    expect(privacy).toMatch(/min-h-11/);
    expect(privacy).toContain("statusClass");
    expect(privacy).toContain("grid-cols-1 gap-2 sm:grid-cols-2");
    expect(privacy).toContain("focus-visible:");
  });

  it("renders real roving super-admin tabs with keyboard panel ownership", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          generatedAt: new Date().toISOString(),
          people: [],
          activity: {},
          aiCosts: [],
          aiByTask: [],
          aiErrors: {},
          foods: [],
          logsByDay: [],
          recentSignups: [],
          recentFailures: [],
        }),
      }),
    );
    const { default: SuperCommandCenter } = await import("@/app/super/page");
    render(React.createElement(SuperCommandCenter));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].getAttribute("tabindex")).toBe("0");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(tabs[5].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[5], { key: "Home" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[5].getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("id")).toBe("super-panel-audit");
    expect(panel.getAttribute("aria-labelledby")).toBe("super-tab-audit");
  });

  it("recovers the real command center overview after a failed fetch", async () => {
    const overview = {
      generatedAt: new Date().toISOString(),
      people: [],
      activity: {},
      aiCosts: [],
      aiByTask: [],
      aiErrors: {},
      foods: [],
      logsByDay: [],
      recentSignups: [],
      recentFailures: [],
    };
    const fetchMock = vi.fn((url: string) =>
      url === "/api/super/overview"
        ? fetchMock.mock.calls.filter(([called]) => called === url).length === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ ok: true, json: async () => overview })
        : Promise.resolve({
            ok: true,
            json: async () => ({
              rows: [],
              total: 0,
              users: [],
              events: [],
              actionFacets: [],
              dataRequests: [],
              corrections: { n: 0, last_at: null },
              totals: {},
              breakdown: [],
              daily: [],
              topRuns: [],
              facets: { providers: [], models: [], tasks: [] },
            }),
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { default: SuperCommandCenter } = await import("@/app/super/page");
    render(React.createElement(SuperCommandCenter));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("offline"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/super/overview"),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("renders a ColumnChart accessible value list outside its visual image", () => {
    render(
      React.createElement(ColumnChart, {
        points: [{ label: "Mon", value: 12 }],
        format: (value: number) => `${value} runs`,
      }),
    );
    expect(screen.getByRole("img")).not.toContain(screen.getByRole("list"));
    expect(screen.getByRole("list").textContent).toContain("Mon: 12 runs");
  });

  it("renders a sortable Th as a native button", () => {
    const sort = vi.fn();
    render(
      React.createElement(
        "table",
        null,
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement(
              Th as React.ComponentType<
                React.PropsWithChildren<{
                  onClick?: () => void;
                  active?: boolean;
                }>
              >,
              { onClick: sort, active: true },
              "Joined",
            ),
          ),
        ),
      ),
    );
    const header = screen.getByRole("columnheader");
    const button = screen.getByRole("button", { name: "Joined ↓" });
    expect(header.getAttribute("aria-sort")).toBe("descending");
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button);
    expect(sort).toHaveBeenCalledTimes(1);
  });

  it("expands an actual failed run only through its named details control", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            rows: [
              {
                id: "run-1",
                task: "food_parse",
                provider: null,
                model: "test",
                status: "failed",
                cost: 0,
                tokens_in: 0,
                tokens_out: 0,
                cache_read: 0,
                latency_ms: null,
                fallback_from: null,
                error: "offline",
                user_id: null,
                created_at: new Date().toISOString(),
              },
            ],
            total: 1,
          }),
        }),
    );
    render(React.createElement(RunsPanel));
    await waitFor(() => screen.getByRole("button", { name: "Expand details" }));
    const button = screen.getByRole("button", { name: "Expand details" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("run-detail-run-1")).not.toBeNull();
  });

  it("retries an actual users roster load without reloading the page", async () => {
    const users = [
      {
        id: "user-1",
        email: "a@example.com",
        full_name: "A User",
        role: "client",
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
        logs_total: 0,
        logs_30d: 0,
        last_log_at: null,
        ai_cost_30d: 0,
        ai_runs_30d: 0,
        messages_30d: 0,
        workouts_30d: 0,
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users }) });
    vi.stubGlobal("fetch", fetchMock);
    const { default: UsersPanel } = await import(
      "@/components/super/UsersPanel"
    );
    render(React.createElement(UsersPanel));

    await waitFor(() => screen.getByRole("alert"));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => screen.getByRole("button", { name: "View details" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers a rejected user detail request for the selected user", async () => {
    const user = rosterUser("user-1", "A User");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: [user] }) })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => userDetail("recovered-task"),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { default: UsersPanel } = await import(
      "@/components/super/UsersPanel"
    );
    render(React.createElement(UsersPanel));

    await waitFor(() => screen.getByRole("button", { name: "View details" }));
    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("detail"),
    );
    expect(screen.getByText(/DETAIL · A User/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => screen.getByText("recovered-task"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the most recently selected user detail when an earlier request resolves late", async () => {
    const first = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const second = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const users = [rosterUser("user-a", "A User"), rosterUser("user-b", "B User")];
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/super/users")
        return Promise.resolve({ ok: true, json: async () => ({ users }) });
      if (url.includes("userId=user-a")) return first.promise;
      return second.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { default: UsersPanel } = await import(
      "@/components/super/UsersPanel"
    );
    render(React.createElement(UsersPanel));

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "View details" })).toHaveLength(2),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[1]);
    second.resolve({ ok: true, json: async () => userDetail("newest-task") });
    await waitFor(() => screen.getByText("newest-task"));
    first.resolve({ ok: true, json: async () => userDetail("stale-task") });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText(/DETAIL · B User/)).not.toBeNull();
    expect(screen.getByText("newest-task")).not.toBeNull();
    expect(screen.queryByText("stale-task")).toBeNull();
  });

  it("keeps newer run results when an earlier filter request fails late", async () => {
    const oldRequest = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const newRequest = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const fetchMock = vi.fn((url: string) =>
      url.includes("window=24h") ? oldRequest.promise : newRequest.promise,
    );
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(RunsPanel));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    newRequest.resolve({
      ok: true,
      json: async () => ({
        rows: [
          {
            id: "new-run",
            task: "new-task",
            provider: null,
            model: "test",
            status: "completed",
            cost: 0,
            tokens_in: 0,
            tokens_out: 0,
            cache_read: 0,
            latency_ms: null,
            fallback_from: null,
            error: null,
            user_id: null,
            created_at: new Date().toISOString(),
          },
        ],
        total: 1,
      }),
    });
    await waitFor(() => screen.getByText("new-task"));
    oldRequest.resolve({ ok: false, json: async () => ({}) });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByText("new-task")).not.toBeNull();
  });

  it("keeps the GDPR queue and offers a retry after a safe action fails", async () => {
    const auditData = {
      events: [],
      actionFacets: [],
      dataRequests: [
        {
          id: "request-1",
          user_name: "Queue User",
          request_type: "export",
          status: "pending",
          requested_at: new Date().toISOString(),
          due_at: null,
          completed_at: null,
        },
      ],
      corrections: { n: 0, last_at: null },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => auditData })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => auditData });
    vi.stubGlobal("fetch", fetchMock);
    const { default: AuditPanel } = await import(
      "@/components/super/AuditPanel"
    );
    render(React.createElement(AuditPanel));

    await waitFor(() => screen.getByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    await waitFor(() => screen.getByRole("alert"));
    expect(screen.getByText("Queue User")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry action" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

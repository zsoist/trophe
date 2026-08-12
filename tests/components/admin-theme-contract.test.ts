import { readFileSync } from "node:fs";
import { join } from "node:path";
// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const react = await import("react");
  return { default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children) };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ generatedAt: new Date().toISOString(), people: [], activity: {}, aiCosts: [], aiByTask: [], aiErrors: {}, foods: [], logsByDay: [], recentSignups: [], recentFailures: [] }) }));
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
});

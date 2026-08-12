# Web Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Trophē load and become interactive as fast as practical on 390×844 mobile and standard desktop, with measured regression budgets.

**Architecture:** A repeatable Playwright measurement script records production and local production-build metrics. Public routes ship server-rendered static content with minimal client JavaScript; authenticated routes defer below-the-fold code and parallelize independent data.

**Tech Stack:** Next.js 16 App Router, React 19, Playwright 1.59, Next build manifests, CSS animations.

## Global Constraints

- Provider spend is USD $0.00.
- Production checks are read-only.
- Mobile 390×844 is measured and fixed before desktop.
- Do not reintroduce service-worker navigation caching.
- Preserve authentication, localization, and accessibility.
- No merge or deployment is authorized.

---

### Task 1: Create a repeatable mobile/desktop measurement harness

**Files:**
- Create: `scripts/perf/measure-web.mjs`
- Create: `tests/performance/measurement-harness.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `measureUrl({ url, viewport, samples }): PerformanceReport`
- Produces: `npm run perf:measure -- --url <url>`
- Writes: `docs/quality/performance-<target>.json`

- [ ] **Step 1: Write failing metric-calculation tests**

Given three sample fixtures, assert the report returns median and worst values
for TTFB, FCP, LCP, CLS, load time, request count, transferred bytes, and long
tasks. Assert it preserves failing request URLs only after stripping query
strings.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/performance/measurement-harness.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement the Playwright collector**

Use Chromium, a fresh context per sample, mobile viewport 390×844 first, and
desktop 1440×900 second. Collect navigation timing, paint entries,
largest-contentful-paint, layout-shift without recent input, resources, response
sizes, and console/network errors.

- [ ] **Step 4: Add package script**

```json
"perf:measure": "node scripts/perf/measure-web.mjs"
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/performance/measurement-harness.test.ts --reporter=verbose
git add scripts/perf/measure-web.mjs tests/performance/measurement-harness.test.ts package.json
git commit -m "perf: add repeatable web measurement harness"
```

### Task 2: Capture production and local baselines

**Files:**
- Create: `docs/quality/performance-production-baseline.json`
- Create: `docs/quality/performance-local-baseline.json`
- Create: `docs/quality/performance-baseline-2026-07-25.md`

- [ ] **Step 1: Measure production three times per viewport**

```bash
npm run perf:measure -- --url https://trophe.app --samples 3 --output docs/quality/performance-production-baseline.json
```

Measure `/` and `/login`. Do not authenticate or submit data.

- [ ] **Step 2: Build and start local production**

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3300
```

- [ ] **Step 3: Measure local three times per viewport**

```bash
npm run perf:measure -- --url http://127.0.0.1:3300 --samples 3 --output docs/quality/performance-local-baseline.json
```

- [ ] **Step 4: Identify code-controlled bottlenecks**

Rank blocking resources, public-route JavaScript, fonts, hero content, hydration,
and server time. Separate production network/CDN effects from local code.

- [ ] **Step 5: Commit baseline evidence**

```bash
git add docs/quality/performance-production-baseline.json docs/quality/performance-local-baseline.json docs/quality/performance-baseline-2026-07-25.md
git commit -m "perf: capture mobile and desktop baselines"
```

### Task 3: Remove the landing page from the client bundle

**Files:**
- Modify: `app/page.tsx`
- Create: `app/es/page.tsx`
- Create: `app/el/page.tsx`
- Create: `components/landing/LandingPage.tsx`
- Create: `components/landing/LanguageLinks.tsx`
- Create: `lib/landing-language.ts`
- Modify: `tests/performance/landing-delivery.test.ts`
- Create: `e2e/public-language.spec.ts`

**Interfaces:**
- Produces: statically prerendered landing pages for `en | es | el`
- Produces: canonical language URLs `/`, `/es`, `/el`

- [ ] **Step 1: Add failing language and browser tests**

Unit-test the literal route map for `en`, `es`, and `el`. In Playwright,
navigate to `/es` and `/el`; assert the localized hero heading and the page
content root's `lang` attribute, then use plain language links and assert the
canonical URL and visible heading update without requiring hydration. The
build-budget task verifies that no language route has an avoidable page-specific
client chunk.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/performance/landing-delivery.test.ts --reporter=verbose
```

- [ ] **Step 3: Convert the page to a server component**

Use a shared server component:

```ts
type LandingLang = 'en' | 'es' | 'el';
<LandingPage lang="en" />
<LandingPage lang="es" />
<LandingPage lang="el" />
```

Keep `/`, `/es`, and `/el` as concrete static route files. Do not await
`searchParams`, `cookies()`, or `headers()` on these routes because current
Next.js treats those request-time APIs as dynamic. `LanguageLinks` contains
only `Link` elements and requires no client directive.

- [ ] **Step 4: Preserve delivery invariants**

Keep CTA prefetch disabled, above-the-fold content visible without entrance
animation, and the authenticated provider graph out of the root layout.

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/performance/landing-delivery.test.ts --reporter=verbose
npx playwright test e2e/public-language.spec.ts --project=mobile-chromium
npm run build
```

Expected: all three routes are statically generated and have no page-specific
client bundle beyond framework-required runtime.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/es/page.tsx app/el/page.tsx components/landing lib/landing-language.ts tests/performance/landing-delivery.test.ts e2e/public-language.spec.ts
git commit -m "perf(landing): render public home on the server"
```

### Task 4: Remove unused public-route font transfer

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/landing/LandingPage.tsx`
- Create: `tests/performance/font-delivery.test.ts`
- Modify: `docs/quality/performance-local-baseline.json`

**Interfaces:**
- Preserves: Inter Latin/Greek, Instrument Serif brand italic, and authenticated
  JetBrains Mono styling
- Removes: English landing preload/request of unused Greek, normal display, and
  monospace font files

- [ ] **Step 1: Write failing delivery assertions**

From a production build and local browser trace, assert `/` does not preload an
Inter Greek file or Instrument Serif normal file, and does not request
JetBrains Mono. Assert `/el` still renders Greek with the configured Inter
family and the brand wordmark still uses Instrument Serif italic.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/performance/font-delivery.test.ts --reporter=verbose
```

- [ ] **Step 3: Remove deterministic waste**

Disable broad global font preloads where the browser's unicode/style selection
can load only used faces. Remove `font-mono` from every marketing-only label
and mockup element so the public DOM does not request JetBrains Mono; preserve
mono styling in authenticated routes. Do not remove Greek support or change the
brand italic. Verify any normal Instrument use outside marketing before
changing its configured styles.

- [ ] **Step 4: Measure, then keep only wins**

Run three clean mobile samples. Keep the change only if English landing font
transfer is at most 80 KiB and mobile median/worst LCP remain within the
committed budgets. Record Greek and English traces separately.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx components/landing/LandingPage.tsx tests/performance/font-delivery.test.ts docs/quality/performance-local-baseline.json
git commit -m "perf(fonts): remove unused landing font transfer"
```

### Task 5: Remove Framer Motion from the login critical path

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/performance/login-delivery.test.ts`
- Modify: `e2e/core-flows.spec.ts`

**Interfaces:**
- Preserves: login, signup, password strength, and loading behavior
- Removes: `framer-motion` import from `/login`

- [ ] **Step 1: Write failing bundle and visible-form tests**

Use a build-manifest fixture to assert the `/login` route has no Framer Motion
chunk. In Playwright, assert the email field and submit action are visible at
initial paint, then switch to signup and verify password-strength feedback
changes after typing a strong password.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/performance/login-delivery.test.ts --reporter=verbose
```

- [ ] **Step 3: Replace motion wrappers**

Use semantic `div` elements. Apply a short CSS keyframe only when it does not
start at opacity zero; use CSS transitions for password-strength widths.
Respect `prefers-reduced-motion`.

- [ ] **Step 4: Verify login behavior**

```bash
npx vitest run tests/performance/login-delivery.test.ts tests/auth/safe-redirect.test.ts --reporter=verbose
npx playwright test e2e/core-flows.spec.ts --project=mobile-chromium
```

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx app/globals.css tests/performance/login-delivery.test.ts
git commit -m "perf(auth): remove motion runtime from login"
```

### Task 6: Enforce public-route delivery budgets

**Files:**
- Create: `scripts/perf/check-build-budgets.mjs`
- Create: `tests/performance/build-budget.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run perf:budget`
- Reads: Next.js build manifests from `.next`

- [ ] **Step 1: Write failing manifest parser tests**

Fixture a build manifest and assert the parser returns shared and route-specific
JavaScript bytes. Fail when `/` or `/login` exceeds the committed baseline by
more than 10%, or when either gains a new page-specific chunk above 50 KiB.

- [ ] **Step 2: Implement the parser**

Read Next-generated manifest files without hardcoding hashed chunk names.
Report route, total bytes, baseline bytes, delta, and largest chunks.

- [ ] **Step 3: Add package script**

```json
"perf:budget": "node scripts/perf/check-build-budgets.mjs"
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
npm run perf:budget
npx vitest run tests/performance/build-budget.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add scripts/perf/check-build-budgets.mjs tests/performance/build-budget.test.ts package.json
git commit -m "test(perf): enforce public route bundle budgets"
```

### Task 7: Optimize the largest authenticated-route bottleneck

**Files:**
- Modify: `app/coach/client/[id]/page.tsx`
- Create: `components/coach/ClientAnalyticsPanels.tsx`
- Create: `tests/performance/coach-client-delivery.test.ts`

**Interfaces:**
- Preserves: above-the-fold task workflow
- Defers: below-the-fold analytics or optional interaction code

- [ ] **Step 1: Prove the client-detail bundle problem**

Use the local production trace and build manifest to record the route bytes
caused by the client-detail page's statically imported analytics components:
macro charts, trend charts, heatmaps, pattern analysis, and comparison panels.

- [ ] **Step 2: Write a failing delivery regression**

Assert `app/coach/client/[id]/page.tsx` imports one
`ClientAnalyticsPanels` boundary instead of each analytics implementation.
Assert the boundary is dynamically imported with SSR preserved and a stable
loading skeleton.

- [ ] **Step 3: Apply one focused split or fetch parallelization**

Move only below-the-fold analytics imports and their rendering block into
`ClientAnalyticsPanels.tsx`. Do not move profile, active habit, coach notes,
quick actions, or above-the-fold client status. Preserve loading, empty, error,
panel-preference, and reduced-motion states.

- [ ] **Step 4: Verify mobile and desktop behavior**

Run the focused test, affected Playwright flow, build, and bundle budget.

- [ ] **Step 5: Commit**

Commit the route, focused component, regression test, and updated measurement
artifact as one performance change.

### Task 8: Final performance comparison

**Files:**
- Create: `docs/quality/performance-local-final.json`
- Create: `docs/quality/performance-final-2026-07-25.md`

- [ ] **Step 1: Measure the final local production build**

Run three mobile and three desktop samples for `/` and `/login`.

- [ ] **Step 2: Compare baseline to final**

Report median and worst TTFB, FCP, LCP, CLS, load time, bytes, requests, and
route JS. A regression over 10% requires investigation before completion.

- [ ] **Step 3: Run performance regression suites**

```bash
npx vitest run tests/performance --reporter=verbose
npm run perf:budget
npx playwright test --project=mobile-chromium
npx playwright test --project=desktop-chromium
```

- [ ] **Step 4: Commit**

```bash
git add docs/quality/performance-local-final.json docs/quality/performance-final-2026-07-25.md
git commit -m "docs(perf): record final delivery improvements"
```

# Public Web Performance Baseline

**Plan date:** 2026-07-25
**Captured:** 2026-07-26, 09:38–09:41 UTC
**Local diagnostic trace:** 2026-07-26, 11:21:11–11:21:25 UTC
**Source state:** `222f21d63681bfb79a10c06196c2f4063affb29c`
**Harness:** `e3c25db95f929d7c8319d8f210ce740611816208`
**Targets:** production and a scrubbed local Next.js production build
**Routes:** `/` and `/login`
**Samples:** three mobile samples first, then three desktop samples, per route and target

## Result

All 24 samples settled after network quiet and were valid under the harness
contract. No sample attempted a blocked write. Production recorded no console
or network failures. The local build recorded a repeatable Vercel Insights
development-host failure: `/_vercel/insights/script.js` returned 404 and
produced sanitized console errors. This local-only analytics failure does not
invalidate timing samples under the harness definition, but it is a real
development parity defect.

The public routes are not slow because of local server execution. Their local
median TTFB was 3.0–4.1 ms. Production median TTFB was 296.0–315.8 ms from this
Bogotá measurement host, adding roughly 293–313 ms before rendering work.

`/login` is the heavier code-controlled route. On both production and local it
used 24 requests, seven more than `/`, and transferred about 110 KB more.
Current local build output references 939,565 raw JavaScript bytes for
`/login`, compared with 589,610 for `/`. Both routes also inherit four
preloaded font files totaling 98,200 raw bytes.

A separate local-only diagnostic trace now identifies the browser-reported
render-blocking chain, authoritative LCP candidate and text leaves, and a
bounded React hydration/main-thread proxy. Its fail-closed contract admitted
all 12 samples: every request remained on the exact loopback origin, no request
was blocked, and every sample settled after network quiet. This is diagnostic
evidence, not a replacement for the approved headline timings.

## Measurement contract

- Mobile: 390×844, measured before desktop.
- Desktop: 1440×900.
- Fresh Chromium context per sample.
- No supplied cookies, authentication, form submission, click, or other
  interaction.
- Only GET, HEAD, and OPTIONS are allowed. Service Workers and WebSockets are
  blocked.
- One second of zero in-flight network activity is required after load, capped
  at five seconds.
- Timing values are milliseconds, transferred sizes are CDP encoded bytes, and
  CLS is unitless.
- The collector is unthrottled Playwright. These values are a repeatable
  before/after baseline, not simulated low-end-device Lighthouse scores or
  field Core Web Vitals.

The full raw per-route reports, samples, sanitized failures, validity counts,
median, and worst values are retained inside:

- `docs/quality/performance-production-baseline.json`
- `docs/quality/performance-local-baseline.json`

## Production baseline

All production viewports had 3 valid and 0 invalid samples, zero blocked
requests, zero console errors, and zero network failures.

### Median

| Route | Viewport | TTFB | FCP | LCP | CLS | Load | Requests | Transfer | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | Mobile | 297.2 ms | 608 ms | 608 ms | 0.000501 | 702.7 ms | 17 | 302,712 B | 0 |
| `/` | Desktop | 315.8 ms | 548 ms | 548 ms | 0.000152 | 689.9 ms | 17 | 302,733 B | 0 |
| `/login` | Mobile | 296.0 ms | 852 ms | 852 ms | 0 | 730.4 ms | 24 | 412,333 B | 0 |
| `/login` | Desktop | 307.5 ms | 848 ms | 848 ms | 0 | 777.7 ms | 24 | 412,333 B | 0 |

### Worst

| Route | Viewport | TTFB | FCP | LCP | CLS | Load | Requests | Transfer | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | Mobile | 335.5 ms | 652 ms | 652 ms | 0.000501 | 742.4 ms | 17 | 302,717 B | 0 |
| `/` | Desktop | 338.6 ms | 612 ms | 612 ms | 0.000152 | 720.2 ms | 17 | 302,735 B | 0 |
| `/login` | Mobile | 321.7 ms | 880 ms | 880 ms | 0 | 791.8 ms | 24 | 412,350 B | 0 |
| `/login` | Desktop | 325.1 ms | 952 ms | 952 ms | 0 | 794.3 ms | 24 | 412,334 B | 0 |

## Local production-build baseline

The build passed with Next.js 16.2.7 and statically prerendered both routes.
The server was bound only to `127.0.0.1:3300`. Provider keys and
`TROPHE_ALLOW_PAID_AI` were pinned empty. Database and Supabase targets were
pinned to local endpoints.

All local viewports had 3 valid and 0 invalid samples and zero blocked
requests. Each viewport accumulated six sanitized console-error events and six
network-error events across its three samples. These represent two events per
sample for the same local Vercel Insights script failure: `http_404` and
`request_failed`.

### Median

| Route | Viewport | TTFB | FCP | LCP | CLS | Load | Requests | Transfer | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | Mobile | 4.1 ms | 48 ms | 48 ms | 0.000501 | 49.1 ms | 17 | 308,923 B | 0 |
| `/` | Desktop | 3.2 ms | 64 ms | 64 ms | 0.000152 | 50.1 ms | 17 | 308,923 B | 0 |
| `/login` | Mobile | 3.1 ms | 84 ms | 84 ms | 0 | 54.8 ms | 24 | 419,181 B | 0 |
| `/login` | Desktop | 3.0 ms | 96 ms | 96 ms | 0 | 52.5 ms | 24 | 419,181 B | 0 |

### Worst

| Route | Viewport | TTFB | FCP | LCP | CLS | Load | Requests | Transfer | Long tasks |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | Mobile | 63.3 ms | 160 ms | 160 ms | 0.000501 | 182.4 ms | 17 | 308,923 B | 0 |
| `/` | Desktop | 4.4 ms | 64 ms | 64 ms | 0.000152 | 58.8 ms | 17 | 308,923 B | 0 |
| `/login` | Mobile | 7.1 ms | 104 ms | 104 ms | 0 | 70.8 ms | 24 | 419,181 B | 0 |
| `/login` | Desktop | 3.1 ms | 96 ms | 96 ms | 0 | 54.5 ms | 24 | 419,181 B | 0 |

The 63.3 ms mobile root TTFB is a first-run local tail, not the median. It is
preserved rather than discarded.

## Local critical-path and hydration diagnostic

This bounded diagnostic used Playwright 1.59.1 with headless Chromium
147.0.7727.15 against the same scrubbed production build on
`127.0.0.1:3300`. It collected three mobile samples before three desktop
samples for each route, always in a fresh context. The diagnostic:

- started a CDP trace before navigation and required a full second with zero
  CDP in-flight requests after load, with five-second deadlines for settlement,
  trace completion, and cleanup;
- required every request and redirect hop to remain on the exact
  `http://127.0.0.1:3300` origin, restricted main-frame navigation to `/` and
  `/login`, rejected credentials and navigation query/fragment state, allowed
  exact-origin non-navigation requests such as Next.js RSC fetches, allowed only
  GET, HEAD, and OPTIONS, and blocked Service Workers and WebSockets;
- supplied no cookies and performed no interaction;
- reused the approved Task 1 CDP transfer accumulator so redirect hops,
  partial failures, cached responses, and duplicate terminal events follow the
  same accounting contract;
- joined CDP resource type, status, and encoded transfer bytes to Resource
  Timing start, duration, initiator, and browser-reported
  `renderBlockingStatus`;
- treated the final buffered LCP candidate as authoritative and retained every
  direct text-bearing descendant with its computed font, plus candidate size
  and resource URL; and
- installed an observer-only React DevTools hook before application code. The
  hydration proxy is the union of non-overlapping renderer-main scripting
  events from React renderer injection through the last initial commit before
  settlement.

The React interval is an upper-bound proxy for hydration plus immediate client
effects, not a React Profiler duration. Trace instrumentation can perturb
timing, so the approved uninstrumented samples above remain the headline
baseline. All 12 samples settled after network quiet with zero remaining
in-flight work. All 12 were valid, had zero blocked requests, and recorded the
already documented local Insights error counts. Login also made one same-origin
RSC fetch per sample after the last React commit; those read-only subresource
requests remained inside the loopback boundary.

### Reconciliation and transferred-byte composition

Every diagnostic group exactly reproduced the approved headline request and
CDP byte totals. All summary, representative, identity, and request-chain
values below are calculated from valid samples only.

| Route | Viewport | Valid | Invalid | Invalid reasons |
|---|---|---:|---:|---|
| `/` | Mobile | 3 | 0 | None |
| `/` | Desktop | 3 | 0 | None |
| `/login` | Mobile | 3 | 0 | None |
| `/login` | Desktop | 3 | 0 | None |

| Route | Viewport | Trace TTFB median | Trace LCP median / worst | Requests | Total transfer | Document | Blocking CSS | JavaScript | Fonts | Fetch | Other | Preloaded fonts |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | Mobile | 3.4 ms | 48 / 172 ms | 17 | 308,923 B | 8,715 B | 20,892 B | 150,217 B | 129,099 B | 0 B | 0 B | 101,792 B |
| `/` | Desktop | 3.3 ms | 56 / 60 ms | 17 | 308,923 B | 8,715 B | 20,892 B | 150,217 B | 129,099 B | 0 B | 0 B | 101,792 B |
| `/login` | Mobile | 2.8 ms | 80 / 132 ms | 24 | 419,181 B | 4,045 B | 20,892 B | 263,740 B | 123,902 B | 6,602 B | 0 B | 101,792 B |
| `/login` | Desktop | 2.7 ms | 88 / 96 ms | 24 | 419,181 B | 4,045 B | 20,892 B | 263,740 B | 123,902 B | 6,602 B | 0 B | 101,792 B |

Document, CSS, JavaScript, font, Fetch, and Other are mutually exclusive CDP
resource types and sum to each row's total; the CSS responses are both
browser-reported blocking. On both routes, the four preloaded font responses
total 101,792 transferred bytes including response overhead, versus 98,200 raw
font-file bytes. The two stylesheets total 20,892 transferred bytes versus
104,620 raw bytes. Root JavaScript transfer is 150,217 bytes versus 589,610 raw
build bytes; login JavaScript transfer is 263,740 bytes versus 939,565 raw build
bytes. Login's post-commit RSC fetch transfers 6,602 bytes as `Fetch`.

### Browser-reported critical request chain

The table retains the median-LCP representative sample for every route and
viewport. Times are relative to navigation start. `blocking` is the browser's
Resource Timing classification; LCP font candidates are preloaded and
non-blocking but retained because the authoritative candidate's direct text
leaves use those faces.

| Route | Viewport | Resource | Type / initiator | Start | Duration | Transfer | Blocking relevance |
|---|---|---|---|---:|---:|---:|---|
| `/` | Mobile | `/` | Document / navigation | 0 ms | 3.430 ms | 8,715 B | Navigation |
| `/` | Mobile | `00207d0873d00653.css` | Stylesheet / link | 4.9 ms | 5.1 ms | 2,021 B | Browser-reported blocking |
| `/` | Mobile | `b20eb98e3adbc985.css` | Stylesheet / link | 4.9 ms | 6.9 ms | 18,871 B | Browser-reported blocking |
| `/` | Mobile | `e4af272ccee01ff0-s.p.woff2` | Font / link | 4.9 ms | 4.4 ms | 49,330 B | Non-blocking preload; LCP Inter candidate |
| `/` | Desktop | `/` | Document / navigation | 0 ms | 3.328 ms | 8,715 B | Navigation |
| `/` | Desktop | `9cc5b37ab1350db7-s.p.woff2` | Font / link | 4.9 ms | 3.7 ms | 16,582 B | Non-blocking preload; LCP Instrument Serif candidate |
| `/` | Desktop | `e4af272ccee01ff0-s.p.woff2` | Font / link | 4.9 ms | 4.8 ms | 49,330 B | Non-blocking preload; LCP Inter candidate |
| `/` | Desktop | `00207d0873d00653.css` | Stylesheet / link | 5.0 ms | 4.3 ms | 2,021 B | Browser-reported blocking |
| `/` | Desktop | `b20eb98e3adbc985.css` | Stylesheet / link | 5.0 ms | 6.3 ms | 18,871 B | Browser-reported blocking |
| `/login` | Mobile | `/login` | Document / navigation | 0 ms | 2.934 ms | 4,045 B | Navigation |
| `/login` | Mobile | `00207d0873d00653.css` | Stylesheet / link | 4.4 ms | 4.7 ms | 2,021 B | Browser-reported blocking |
| `/login` | Mobile | `b20eb98e3adbc985.css` | Stylesheet / link | 4.4 ms | 7.6 ms | 18,871 B | Browser-reported blocking |
| `/login` | Mobile | `9cc5b37ab1350db7-s.p.woff2` | Font / link | 4.4 ms | 3.7 ms | 16,582 B | Non-blocking preload; LCP Instrument Serif candidate |
| `/login` | Desktop | `/login` | Document / navigation | 0 ms | 2.927 ms | 4,045 B | Navigation |
| `/login` | Desktop | `9cc5b37ab1350db7-s.p.woff2` | Font / link | 4.4 ms | 3.3 ms | 16,582 B | Non-blocking preload; LCP Instrument Serif candidate |
| `/login` | Desktop | `00207d0873d00653.css` | Stylesheet / link | 4.5 ms | 4.3 ms | 2,021 B | Browser-reported blocking |
| `/login` | Desktop | `b20eb98e3adbc985.css` | Stylesheet / link | 4.5 ms | 6.1 ms | 18,871 B | Browser-reported blocking |

No JavaScript is browser-reported render-blocking. It remains relevant to
interactivity and hydration, measured separately below.

### Authoritative hero/LCP identity

| Route | Viewport | LCP candidate and direct text leaves | Fonts | Size | Trace LCP median / worst | Direct resource |
|---|---|---|---|---:|---:|---|
| `/` | Mobile | `P` candidate and direct text: “AI-powered food logging…built for athletes.” | Inter 400 normal | 31,164 px² | 48 / 172 ms | Text; 0 B |
| `/` | Desktop | `H1` candidate: “Track smarter. Eat better.”; `SPAN`: “Track smarter.”; `SPAN`: “Eat better.” | Inter 700 normal + Instrument Serif 400 italic | 58,078 px² | 56 / 60 ms | Text; 0 B |
| `/login` | Mobile | `A` candidate; `SPAN`: “trophē” | Instrument Serif 400 italic | 2,730 px² | 80 / 132 ms | Text; 0 B |
| `/login` | Desktop | `A` candidate; `SPAN`: “trophē” | Instrument Serif 400 italic | 2,730 px² | 88 / 96 ms | Text; 0 B |

All three samples in each row produced the same authoritative candidate and
direct-text-leaf identity. None of the candidates is an image or has its own
resource URL, so direct LCP media transfer is zero. The desktop root heading has
two font dependencies—not one—both retained in its critical chain; login's
wordmark uses Instrument Serif.

### Hydration and renderer-main cost

The `Initial JS` column counts seven Next.js requests on root and ten on login;
the diagnostic's all-script count is one higher because the zero-byte failed
Insights script can begin before the last React commit. The static HTML
reference count is one higher than the modern-Chromium initial request count
because it includes the `nomodule` polyfills script, which this browser does not
fetch. Login then fetches one 9,979-byte Next.js route chunk after the last
initial React commit.

| Route | Viewport | Initial Next JS | Post-commit route prefetch | Inject→first commit median / worst | Inject→last commit median / worst | Scripting in React window median / worst | Main-thread busy to settle median | Longest task worst |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | Mobile | 7 / 150,217 B | 0 / 0 B | 16.1 / 29.6 ms | 18.7 / 35.2 ms | 15.268 / 29.549 ms | 89.514 ms | 49.953 ms |
| `/` | Desktop | 7 / 150,217 B | 0 / 0 B | 16.4 / 18.4 ms | 19.4 / 20.7 ms | 15.564 / 16.236 ms | 72.596 ms | 16.978 ms |
| `/login` | Mobile | 10 / 253,761 B | 1 / 9,979 B | 19.4 / 24.7 ms | 33.4 / 52.4 ms | 31.869 / 47.250 ms | 73.287 ms | 16.058 ms |
| `/login` | Desktop | 10 / 253,761 B | 1 / 9,979 B | 18.8 / 19.2 ms | 32.8 / 33.8 ms | 31.318 / 31.949 ms | 75.177 ms | 14.112 ms |

Every sample recorded four initial React commits, no commit error, a final
non-dehydrated root, and zero renderer-main tasks over 50 ms.

## Route delivery observations

These values come from the current scrubbed local production build's static
HTML and `.next/static` files. JavaScript, font, and CSS values below are
uncompressed file sizes, not transferred bytes.

| Route | Static HTML | JS refs | Raw JS | CSS refs | Raw CSS | Preloaded fonts | Raw preloaded fonts |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 32,697 B | 8 | 589,610 B | 2 | 104,620 B | 4 | 98,200 B |
| `/login` | 10,209 B | 11 | 939,565 B | 2 | 104,620 B | 4 | 98,200 B |

The root page chunk is 28,763 raw bytes. The login page chunk itself is 11,491
raw bytes, but the route pulls three additional large shared/authentication UI
chunks, making its total referenced JavaScript 349,955 bytes larger than the
root.

Both `app/page.tsx` and `app/login/page.tsx` are Client Components. The root
hydrates the complete marketing page for its language state. Login needs
interactivity but also imports Supabase, Framer Motion, router/search-parameter
logic, signup helpers, and icons. Those dependencies align with the seven
additional requests and approximately 110 KB additional transfer observed on
both targets.

`app/layout.tsx` globally configures Inter Latin and Greek plus Instrument
Serif normal and italic. The resulting static HTML preloads four fonts on both
routes. JetBrains Mono is configured without preload but is used above the fold
on both pages, so runtime font work may exceed the four explicit preloads.

## Ranked bottlenecks and constraints

The ordered ranking below uses measured delay first, then transferred bytes and
renderer-main cost. It separates the production delivery path from code that
can be changed in this repository.

1. **Production network/CDN/origin path — largest measured delay, but not
   partitioned by this baseline.** Production median TTFB exceeds local by
   292.9–312.6 ms across the four route/viewport pairs. Root production LCP
   exceeds local by 484–560 ms and login by 752–768 ms, while production
   transfer is 6–7 KB smaller. The evidence proves a combined remote delivery
   path/origin delta; it does not independently divide that delta among DNS,
   TLS, CDN edge, transit, and origin execution.

2. **Public-route JavaScript and hydration — largest code-controlled cost.**
   Root transfers 150,217 JavaScript bytes across seven initial Next.js
   requests and spends 15.3–15.6 ms median renderer-main scripting inside the
   React window. Login transfers 263,740 JavaScript bytes, including a
   9,979-byte route chunk after the last initial React commit, and spends
   31.3–31.9 ms median scripting in the React window. Build inspection shows
   939,565 raw JavaScript bytes referenced by login versus 589,610 by root. The
   complete landing page is a Client Component even though most of it is static.

3. **Fonts — second-largest code-controlled transfer, mostly unconditional.**
   Each route preloads four font files totaling 98,200 raw bytes and 101,792
   transferred bytes. Total font transfer reaches 129,099 bytes on root and
   123,902 bytes on login after CSS-selected runtime faces. Mobile root uses
   Inter for its LCP; desktop root uses both Inter and Instrument Serif; login
   uses Instrument Serif. The unconditional four-font preload is still broader
   than the observed LCP dependencies.

4. **Render-blocking resources — real but locally short.** Chromium classifies
   exactly the two CSS files as blocking. Together they transfer 20,892 bytes;
   in representative samples the larger sheet takes 6.1–7.6 ms after its
   4.4–5.0 ms start. No JavaScript or font response is browser-reported
   blocking. CSS is a critical-path constraint, but smaller than the JS and
   font transfer opportunities on loopback.

5. **Hero/LCP content — text-only, not a heavy media bottleneck.**
   Mobile root LCP is the hero-support paragraph; desktop root is the “Track
   smarter. Eat better.” heading with Inter and Instrument Serif text leaves.
   Login LCP is the Instrument Serif “trophē” wordmark. Every candidate has zero
   direct resource bytes and stable identity across its three samples.

6. **Local server time — not a current code bottleneck.** Headline local median
   TTFB is 3.0–4.1 ms and instrumented medians are 2.7–3.4 ms. The
   first-run 63.3 ms root tail is preserved, but the three-sample medians do not
   support prioritizing local server execution ahead of delivery, JavaScript,
   fonts, or CSS.

CLS remains effectively zero. Neither the approved samples nor the diagnostic
observed a Long Tasks API entry. Every diagnostic renderer-main task was below
50 ms, so layout instability and severe main-thread blocking are not
first-order targets.

## Measurement-contract distinction

The approved baseline is unthrottled Playwright at the exact 390×844 and
1440×900 viewports. It must not be compared as a speedup against Lighthouse
results that use a different viewport or simulated throttling. This report does
not rely on an ignored reconnaissance file for its ranked claims; the
production/local comparison, local trace, and build observations needed for the
ranking are retained in the committed evidence.

The local diagnostic deliberately has a stricter request contract than the
approved headline harness: every request and redirect hop must preserve the
exact loopback origin, URL credentials are always forbidden, and navigation
query/fragment state is rejected. Exact-origin non-navigation requests may
retain the query state needed by Next.js RSC fetches; this does not permit a
different host, scheme, or port, and main-frame navigation remains restricted
to `/` and `/login`.

## Commands and environment

The approved harness exports `runMeasurements`. A small inline Node wrapper
invoked that exact function and wrote each untouched one-route report to the
unique temporary directory
`/tmp/trophe-perf-baseline.OaOZXO`. This was necessary because the harness CLI
writer intentionally accepts only final `docs/quality/performance-*.json`
paths, while Task 2 requires raw temporary fragments under `/tmp`.

Production route shape:

```bash
/usr/bin/env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  node --input-type=module -e '<import runMeasurements; run 3 samples; write returned JSON>' \
  https://trophe.app/ /tmp/trophe-perf-baseline.OaOZXO/production-root.json
```

The same command measured `https://trophe.app/login`. No credentials or paid
flags entered either process.

Local build/start shape:

```bash
/usr/bin/env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_URL=http://127.0.0.1:54321 \
  OPENAI_API_KEY= ANTHROPIC_API_KEY= DEEPSEEK_API_KEY= VOYAGE_API_KEY= \
  GOOGLE_API_KEY= GOOGLE_GENERATIVE_AI_API_KEY= GEMINI_API_KEY= \
  MISTRAL_API_KEY= LANGFUSE_PUBLIC_KEY= LANGFUSE_SECRET_KEY= \
  SUPABASE_SERVICE_ROLE_KEY= TROPHE_ALLOW_PAID_AI= \
  npm run build

# Same scrubbed environment:
npm run start -- --hostname 127.0.0.1 --port 3300
```

The inline harness wrapper then measured
`http://127.0.0.1:3300/` and `http://127.0.0.1:3300/login`. The server was
stopped with SIGINT and port 3300 was verified closed.

The build emitted ignored, untracked `public/sw.js`. It was moved recoverably,
not deleted, to
`/tmp/trophe-perf-baseline.OaOZXO/generated-public-sw.js`.

The local diagnostic reused the same scrubbed server environment. Its committed
bounded collector wrote only the reduced output to a unique temporary
directory:

```bash
node scripts/perf/collect-local-bottlenecks.mjs \
  --url http://127.0.0.1:3300 \
  --output /tmp/trophe-bottleneck-trace.WWIyod/local-bottlenecks.json \
  --samples 3
```

The reduced per-sample observations, calculation summaries, representative
critical chains, method schema, browser version, and reconciliation fields are
retained under `bottleneckDiagnostic` in
`docs/quality/performance-local-baseline.json`. The multi-megabyte raw Chrome
events were not added to the repository.

## Limitations

- This is a 3-sample lab snapshot from one host, not field data.
- No CPU or network throttling was applied.
- No authenticated product route was measured.
- FCP and LCP matched in these samples; the harness reports the final buffered
  LCP it observed after settlement.
- Headline CDP transferred bytes do not classify bytes by resource type; the
  separate local diagnostic adds CDP type and Resource Timing joins without
  changing the headline samples.
- The React diagnostic hook and tracing categories add observer overhead. Its
  timing values are used for bottleneck attribution and reconciliation, not as
  replacement release budgets.
- The React-window scripting union is an upper-bound proxy for hydration plus
  immediate effects, not a component-level React Profiler measurement.
- Static build asset sizes are raw, not compressed transfer sizes.
- Harness validity covers read-only enforcement and settlement. Console and
  network failures are reported separately and must not be inferred from the
  `valid` flag.

## Release status

The approved production/local baseline and valid diagnostic evidence are ready.
No source optimization, deployment, merge, push, authentication, production
mutation, provider API call, or paid spend occurred.

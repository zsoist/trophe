# Public Web Performance Baseline

**Plan date:** 2026-07-25
**Captured:** 2026-07-26, 09:38–09:41 UTC
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

## Network/CDN versus code bottlenecks

### Network and delivery path

- Production median TTFB exceeds local by 292.9–312.6 ms across the four
  route/viewport pairs.
- Root production LCP exceeds local by 484–560 ms; login exceeds local by
  752–768 ms.
- Production transfer is about 6–7 KB smaller than local for the same route,
  so the production delay is not explained by a larger response payload.
- The prior read-only reconnaissance observed Vercel edge hits and roughly
  200 ms to TLS completion from the same Bogotá region. That supports, but
  does not prove globally, that connection path and geography contribute
  materially to current production TTFB.

### Code-controlled

- Login costs seven requests and about 110 KB transfer beyond root in both
  environments.
- Login references 11 JavaScript files and 939,565 raw bytes versus 8 files and
  589,610 bytes for root.
- Four global font preloads cost 98,200 raw bytes on each public route.
- The entire landing page is a Client Component even though most content is
  static.
- The local server emits predictable Vercel Insights 404/console noise on every
  sample. Production serves the same integration without errors.
- CLS is effectively zero and no long task was observed, so layout instability
  and severe main-thread blocking are not the first optimization targets.

## Reconciliation with the earlier read-only reconnaissance

The earlier
`.superpowers/sdd/2026-07-25-web-performance/production-readonly-recon.md`
measured only `/` with Lighthouse, a different viewport, simulated mobile
throttling, and Lighthouse-specific scoring. Its 1.595 s median mobile LCP and
311,466-byte representative transfer are not copied into this baseline.

The new approved harness records an unthrottled 390×844 root median LCP of
608 ms and 302,712 transferred bytes. These are not a speedup claim; the
measurement contracts differ.

The earlier route hypotheses remain source-supported: its named framework
chunks and preloaded font hashes are present in the current local build, the
root remains a full Client Component, and global font delivery remains heavy.
This run adds the previously unmeasured `/login` route and shows it is the
larger public delivery target.

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

## Limitations

- This is a 3-sample lab snapshot from one host, not field data.
- No CPU or network throttling was applied.
- No authenticated product route was measured.
- FCP and LCP matched in these samples; the harness reports the final buffered
  LCP it observed after settlement.
- CDP transferred bytes include all allowed navigation/subresource responses
  but do not classify bytes by resource type.
- Static build asset sizes are raw, not compressed transfer sizes.
- Harness validity covers read-only enforcement and settlement. Console and
  network failures are reported separately and must not be inferred from the
  `valid` flag.

## Release status

Baseline evidence is ready. No source optimization, deployment, merge, push,
authentication, production mutation, provider API call, or paid spend occurred.

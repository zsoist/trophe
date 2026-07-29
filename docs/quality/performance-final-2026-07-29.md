# Final Web Performance Comparison

**Captured:** 2026-07-29
**Source state:** `43c9b0f7cf57ebeaec0defe7a59a8d3e7a0277fb`
**Target:** local Next.js production build on `127.0.0.1:3300`
**Method:** three fresh contexts per viewport and route, mobile first, measured
sequentially after one read-only warmup GET per route.

No form was submitted, no mutation request was allowed, no provider API was
called, and no paid AI approval or key was used.

## Result

The public landing route now transfers 58,736 fewer bytes and uses three fewer
requests. Login transfers 71,615 fewer bytes and uses two fewer requests. All
12 final samples were valid, no sample had a blocked request, and median long
tasks remained zero.

The landing route's median LCP is unchanged at 48 ms mobile and 64 ms desktop,
while mobile worst LCP improved from 160 ms to 100 ms. Login improved across
both viewports: median LCP fell from 84 ms to 76 ms mobile and from 96 ms to
68 ms desktop.

### Median

| Route | Viewport | Metric | Baseline | Final | Change |
|---|---|---|---:|---:|---:|
| `/` | Mobile | LCP | 48 ms | 48 ms | 0.0% |
| `/` | Mobile | Load | 49.1 ms | 48.8 ms | -0.6% |
| `/` | Mobile | Transfer | 308,923 B | 250,187 B | -19.0% |
| `/` | Mobile | Requests | 17 | 14 | -17.6% |
| `/` | Desktop | LCP | 64 ms | 64 ms | 0.0% |
| `/` | Desktop | Load | 50.1 ms | 56.7 ms | +13.2% |
| `/` | Desktop | Transfer | 308,923 B | 250,187 B | -19.0% |
| `/` | Desktop | Requests | 17 | 14 | -17.6% |
| `/login` | Mobile | LCP | 84 ms | 76 ms | -9.5% |
| `/login` | Mobile | Load | 54.8 ms | 50.8 ms | -7.3% |
| `/login` | Mobile | Transfer | 419,181 B | 347,566 B | -17.1% |
| `/login` | Mobile | Requests | 24 | 22 | -8.3% |
| `/login` | Desktop | LCP | 96 ms | 68 ms | -29.2% |
| `/login` | Desktop | Load | 52.5 ms | 43.0 ms | -18.1% |
| `/login` | Desktop | Transfer | 419,181 B | 347,566 B | -17.1% |
| `/login` | Desktop | Requests | 24 | 22 | -8.3% |

### Worst

| Route | Viewport | Baseline LCP | Final LCP | Baseline load | Final load |
|---|---|---:|---:|---:|---:|
| `/` | Mobile | 160 ms | 100 ms | 182.4 ms | 128.1 ms |
| `/` | Desktop | 64 ms | 92 ms | 58.8 ms | 73.7 ms |
| `/login` | Mobile | 104 ms | 80 ms | 70.8 ms | 54.4 ms |
| `/login` | Desktop | 96 ms | 68 ms | 54.5 ms | 46.2 ms |

## Regression investigation

The root desktop worst LCP increased by 28 ms and median load by 6.6 ms despite
19.0% fewer transferred bytes, 17.6% fewer requests, unchanged median LCP, and
zero median or worst long tasks. At these sub-100 ms unthrottled local timings,
the relative percentage is dominated by small host scheduling variation. The
first concurrent run demonstrated that sensitivity by producing a shared
72–74 ms TTFB spike on both routes; it was rejected because the baseline was
captured sequentially. The retained sequential run is the comparable evidence.
There is no resource, request, JavaScript-budget, or long-task regression
correlated with the desktop tail.

CLS moved from extremely small baseline values to 0.000760 mobile and 0.000453
desktop on `/`, and to 0.000331 mobile and 0.000054 desktop on `/login`.
Those absolute values remain far below the 0.1 “good” threshold and reflect the
intentional switch from broad font preload to unicode/style-selected font
delivery. English landing font transfer is now 72,560 bytes, below the 80 KiB
budget.

## Enforced delivery budgets

- `/`: 18,283 raw referenced client bytes; 20,111-byte fail threshold.
- `/login`: 271,430-byte committed baseline; 298,573-byte fail threshold.
- A new route-specific chunk over 50 KiB fails the gate.
- `npm run perf:budget` passes for both routes.

The raw final samples and summaries are in
`docs/quality/performance-local-final.json`. English and Greek font traces are
retained separately, and the coach client-detail bundle comparison is recorded
in `docs/quality/performance-coach-client-2026-07-29.json`.

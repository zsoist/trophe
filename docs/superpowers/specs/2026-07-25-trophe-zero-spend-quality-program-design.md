# Trophē Zero-Spend Quality Program

**Date:** 2026-07-25
**Status:** Approved direction; implementation pending
**Production boundary:** Read-only. No merge or deployment is authorized.
**Provider-spend boundary:** USD $0.00. No paid AI API request may be made.

## Objective

Raise Trophē to a measurable release-quality standard across four ordered workstreams:

1. deterministic verification;
2. frontier-level AI runtime and offline evaluation infrastructure;
3. application and AI security;
4. mobile and desktop delivery performance.

The program optimizes the product that exists. It does not add speculative AI
features, alter production data, change golden-set tolerances, or redesign the
entire application.

## Success Definition

The work is complete only when the evidence generated from the final commit
supports all of the following:

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` finish
  successfully from a clean checkout.
- Every previously failing or hanging verification has a documented root cause
  and a regression test or deterministic configuration fix.
- AI runtime behavior is covered without provider calls: routing, structured
  output, aborts, timeouts, retries, caching, cost calculation, budget
  enforcement, telemetry, redaction, and malformed-provider responses.
- Offline evaluation fixtures cover Luna-primary and Anthropic-fallback
  contracts without pretending to measure live model quality.
- No test, benchmark, build, or evaluation can contact a paid provider unless a
  separate explicit opt-in flag is present. That flag remains unset in this
  program.
- Security checks find no exposed secret, client-side service-role key, missing
  AI-route authorization, uncontrolled input, unredacted provider error, or
  production write introduced by this branch.
- Public production performance is measured read-only on mobile and desktop.
  Local production builds meet defined bundle and page-delivery budgets or
  document a concrete external blocker.
- Mobile verification uses 390×844 first. Desktop verification uses a standard
  Chromium desktop viewport.
- Every material claim links to a command output, test result, trace, bundle
  report, or captured benchmark artifact.

“10/10” means all release gates pass and no known P0/P1 finding remains in these
four workstreams. It does not mean that synthetic lab measurements guarantee
real-user field percentiles or that mocked provider tests prove live model
quality.

## Workstream 1: Verification Foundation

### Baseline

Run each gate independently with bounded execution time and capture:

- runtime versions;
- command duration;
- last successful stage;
- process state when a command stalls;
- environmental dependencies such as local database availability.

The earlier July 17 observation that Vitest and TypeScript stalled is a
hypothesis, not current truth. Main has changed since then and must be
re-baselined.

### Root-cause process

For every failure:

1. reproduce the smallest failing command;
2. identify the responsible layer;
3. write a failing regression test where behavior can be tested;
4. make the smallest correction;
5. rerun the focused test and then the full gate.

Tests that require unavailable infrastructure must fail quickly with a useful
message or be placed behind an explicit integration-test command. They must not
silently hang.

### Gate design

The canonical release sequence remains:

```text
typecheck → lint → unit/integration tests → production build
```

Browser tests run after the local production surface is stable. Paid evals are
not part of this program.

## Workstream 2: AI Runtime and Offline Harness

### Runtime boundaries

Keep `agents/router/policies.ts` as the only model-routing authority:

- consumer structured text: GPT-5.6 Luna, then Claude Haiku 4.5 fallback;
- health-context and vision: Claude Haiku 4.5;
- synthetic factory: DeepSeek only;
- embeddings: Voyage only.

Provider adapters expose one normalized result contract. The execution layer,
not individual features, owns timeout, retry, budget, telemetry, and
persistence behavior.

### Reliability contract

The offline suite must verify:

- request abort reaches the underlying fetch for every provider;
- timeout produces one normalized timeout result;
- retry is bounded and limited to explicitly retryable transport or provider
  statuses;
- non-retryable schema, authentication, budget, and policy errors fail once;
- fallback respects lane policy and remaining deadline/budget;
- structured requests use the strongest supported schema guarantee;
- malformed JSON, missing tool calls, extra fields, truncated output, empty
  output, and provider error bodies are normalized safely;
- request IDs make duplicate-attempt telemetry auditable;
- user-facing errors never reveal provider bodies, keys, prompts, or stack
  traces.

### Cost and cache contract

Use provider-specific token usage and immutable pricing tables to calculate:

- uncached input;
- cache creation/write input;
- cache read input;
- output;
- total projected and actual cost.

Tests cover cache hits, cache writes, no-cache calls, missing usage fields,
rounding boundaries, retries, and fallback. A budget reservation is checked
before every attempt; reconciliation occurs from returned usage after the
attempt.

### Zero-spend network lock

Provider access defaults to denied in test and evaluation commands. A paid
provider request requires an explicit environment opt-in that is absent from
normal scripts and CI. Offline fixtures and mock transports are the only
allowed evaluation sources in this program.

The lock must fail closed and identify the attempted provider. It must not log
keys, request bodies, or health data.

### Offline evaluation harness

Build a reusable scenario matrix from sanitized fixtures:

- success responses for each provider;
- strict structured-output success;
- schema violation;
- cache read/write accounting;
- 429 and retry-after;
- 5xx transient failure;
- timeout and abort;
- truncated response;
- content-filter/policy refusal;
- fallback success and fallback exhaustion;
- prompt-injection-shaped user input;
- maximum-length and control-character input.

The harness reports contract pass rate, latency simulated by the fixture,
attempt count, fallback path, token accounting, projected cost, and redaction
status. It must label the results “offline provider-contract evaluation,” never
as live model-quality evidence.

## Workstream 3: Security

### AI surface

- All AI routes use verified Supabase identity and the shared asynchronous
  authorization guard.
- Inputs are length-capped, control-character stripped, schema-validated, and
  treated as untrusted data.
- Tool and structured-output schemas reject unknown or dangerous fields.
- Provider endpoints and keys remain server-only.
- Error and telemetry payloads use allowlists.
- User or client health context is not placed in cache keys, logs, or stable
  identifiers.
- Cost/budget checks are not bypassable by fallback or retry.

### Application surface

Run repository guards and targeted review for:

- committed secrets and unsafe environment-variable exposure;
- route authorization and role matrices;
- service-role references in client bundles;
- unsafe HTML/script injection;
- unsafe redirects, webhook verification, and file/image handling;
- missing rate/input limits on expensive routes;
- production mutation paths in tests and eval scripts.

Findings are ranked P0–P3. P0/P1 findings in scope are fixed test-first before
performance polish.

## Workstream 4: Mobile and Desktop Performance

### Measurement

Measure production read-only and the local production build separately.
Production establishes user-visible symptoms; local builds determine whether
the branch fixes code-controlled causes.

Capture at least:

- TTFB, FCP, LCP, CLS, and total load time;
- transferred bytes, request count, and blocking resources;
- route and shared JavaScript sizes;
- font and image delivery;
- middleware/server timing where observable;
- client hydration and long tasks;
- console/network failures;
- service-worker state and cache headers.

Run mobile first at 390×844, then desktop. Use multiple samples for noisy
network metrics and report median plus worst sample.

### Performance budgets

For public landing and login routes on the local production build:

- no unexpected service-worker navigation caching;
- no render-blocking third-party script required for first content;
- CLS ≤ 0.10;
- LCP target ≤ 2.5 seconds in the selected mobile lab profile;
- no single avoidable first-party client chunk dominates the critical path;
- fonts and hero media are explicitly prioritized or deferred according to
  above-the-fold need;
- public routes do not mount authenticated provider graphs.

For authenticated routes:

- data dependencies are parallelized where independent;
- above-the-fold UI does not wait on below-the-fold analytics;
- expensive client components are lazy-loaded when interaction does not require
  them immediately;
- repeated requests and avoidable full-page navigations are eliminated;
- mobile interaction remains functional with JavaScript and network throttling.

If a target cannot be proven without a deployed preview or authenticated test
account, the local evidence and exact verification gap are reported rather
than guessed.

## Subagent Execution Model

Only Codex subagents are used. After the implementation plan is written:

- one subagent owns verification/toolchain diagnosis;
- one owns the AI runtime and offline harness audit;
- one owns security and performance measurement;
- the primary agent owns integration, conflicting edits, final verification,
  and the no-spend boundary.

Subagents begin with read-only investigation. Implementation assignments are
file-scoped and test-first. No subagent receives or uses provider keys.

## Data Flow

```text
sanitized feature input
  → route authorization and rate/input guard
  → task policy selection
  → budget reservation
  → provider adapter through injectable transport
  → normalized structured result
  → schema validation
  → cost reconciliation and redacted telemetry
  → feature result or normalized error

offline fixture
  → mock transport
  → same execution and provider code
  → contract assertions and evaluation report
```

The harness must exercise production runtime code through dependency injection,
not maintain a second simulator implementation.

## Error Handling

- All asynchronous work has a bounded deadline.
- Abort signals propagate through every transport.
- Retry decisions use normalized error categories.
- Budget exhaustion, authorization failure, schema failure, and invalid input
  are never retried.
- Fallback cannot exceed the original request deadline or budget.
- Persistence/telemetry failure cannot turn a valid model response into a
  duplicate paid attempt.
- Logs contain correlation IDs and normalized categories, not sensitive inputs
  or provider payloads.

## Testing Strategy

Use the test pyramid:

1. pure unit tests for pricing, budgeting, schema normalization, cache usage,
   retry classification, redaction, and input sanitation;
2. provider contract tests using mock fetch/transport;
3. execution integration tests using fixture providers and fake persistence;
4. route tests for auth, rate limits, caps, and response redaction;
5. offline evaluation scenarios using the same runtime;
6. Playwright smoke and responsive tests for critical public and authenticated
   shells where credentials are available;
7. production read-only performance checks.

No test may weaken a golden tolerance to become green. Any necessary tolerance
change remains a separately approved work order with
`tolerance_justification`.

## Artifacts

The branch will produce:

- focused regression tests beside each fix;
- offline provider fixtures with no secrets or personal data;
- a zero-spend AI contract-evaluation command;
- a verification report with commands and durations;
- a security findings/fixes report;
- mobile and desktop performance baselines and post-change comparison;
- updated architecture/runtime documentation where behavior changes.

## Non-Goals and Approval Boundaries

This program does not authorize:

- live Luna, Anthropic, DeepSeek, Voyage, Gemini, or judge calls;
- production database writes or migrations;
- merging to `main`;
- deploying to Vercel or another environment;
- changing golden-set acceptance criteria;
- storing real user prompts, credentials, images, or health records as fixtures;
- claiming live AI quality from mocks.

The operator must separately authorize any future paid evaluation, merge,
deployment, production mutation, or tolerance change.

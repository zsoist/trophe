# AI Runtime and Offline Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Luna and Anthropic execution resilient, cost-correct, secure, and comprehensively testable without making a provider request.

**Architecture:** Provider adapters accept injectable transports and return normalized results or typed provider errors. The shared execution layer classifies failures, enforces one end-to-end deadline and budget, and applies policy-safe fallback. A fixture-driven offline harness uses those same adapters and execution code.

**Tech Stack:** TypeScript, native Fetch API, Zod 4, Vitest 4, JSON fixtures.

## Global Constraints

- Provider spend is USD $0.00.
- No live OpenAI, Anthropic, DeepSeek, Voyage, Gemini, or judge call.
- `agents/router/policies.ts` remains the sole routing authority.
- Do not edit an in-use prompt file.
- Do not change golden data or acceptance tolerances.
- Never log prompts, provider bodies, keys, health data, or raw user identifiers.

---

### Task 1: Normalize Anthropic transport behavior

**Files:**
- Modify: `agents/clients/anthropic.ts`
- Modify: `agents/runtime/providers/anthropic.ts`
- Create: `tests/agents/anthropic-provider.test.ts`

**Interfaces:**
- Produces: `AnthropicApiError`
- Produces: `callAnthropicMessages(input: AnthropicMessagesInput & { signal: AbortSignal; fetchImpl?: typeof fetch })`
- Produces: `invokeAnthropicJson({ body, signal, fetchImpl? })`

- [ ] **Step 1: Write failing abort and error tests**

Assert that the fetch options contain the exact `AbortSignal`. Add fixtures for
403 JSON error, 429 JSON error, non-JSON 503, and malformed success. Assert the
error exposes only `status`, `code`, `type`, `requestId`, usage, latency, and
provider generation ID.

- [ ] **Step 2: Run the focused test**

```bash
npx vitest run tests/agents/anthropic-provider.test.ts --reporter=verbose
```

Expected: FAIL because the text client does not accept `signal` and errors are
returned as raw text.

- [ ] **Step 3: Implement the typed error**

Mirror the safe OpenAI error shape:

```ts
export class AnthropicApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly type?: string;
  readonly requestId?: string;
  readonly usage?: AiUsage;
  readonly latencyMs?: number;
  readonly providerGenerationId?: string;
}
```

Cap diagnostic strings at 120 characters and never attach the response body.

- [ ] **Step 4: Propagate signal and inject transport**

Use `fetchImpl ?? fetch` and pass `signal` in every Anthropic request. Convert
non-2xx and malformed responses into `AnthropicApiError`.

- [ ] **Step 5: Run focused tests**

```bash
npx vitest run tests/agents/anthropic-provider.test.ts tests/agents/provider-error.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/clients/anthropic.ts agents/runtime/providers/anthropic.ts tests/agents/anthropic-provider.test.ts
git commit -m "fix(ai): normalize and abort Anthropic requests"
```

### Task 2: Enforce Anthropic structured output and cache policy

**Files:**
- Modify: `agents/runtime/providers/structured.ts`
- Test: `tests/agents/anthropic-provider.test.ts`

**Interfaces:**
- Consumes: `RoutingPolicy.cacheSystem`
- Produces: strict Anthropic tool definition and cacheable system block

- [ ] **Step 1: Add failing wire-format assertions**

For an Anthropic policy with `strict: true` and `cacheSystem: true`, assert the
request body contains:

```ts
{
  system: [{
    type: 'text',
    text: 'system',
    cache_control: { type: 'ephemeral' },
  }],
  tools: [{
    name: 'submit_result',
    input_schema: schema,
    strict: true,
  }],
}
```

Also assert `strict: false` omits the strict field.

- [ ] **Step 2: Prove the tests fail**

```bash
npx vitest run tests/agents/anthropic-provider.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement the body adapter**

Construct the cacheable system block only when `policy.cacheSystem` is true and
propagate the existing `strict` option to the tool definition.

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/agents/anthropic-provider.test.ts tests/agents/fallback-schema-compat.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add agents/runtime/providers/structured.ts tests/agents/anthropic-provider.test.ts
git commit -m "fix(ai): enforce Anthropic structured contracts"
```

### Task 3: Classify failures before retry or fallback

**Files:**
- Create: `agents/runtime/error-classification.ts`
- Modify: `agents/runtime/execute.ts`
- Modify: `agents/runtime/types.ts`
- Test: `tests/agents/runtime-execute.test.ts`

**Interfaces:**
- Produces: `classifyAiError(error): 'timeout' | 'rate_limit' | 'transient' | 'auth' | 'schema' | 'budget' | 'policy' | 'invalid_input' | 'unknown'`
- Produces: `isFallbackEligible(category): boolean`

- [ ] **Step 1: Add failing classification and fallback tests**

Assert auth, schema, budget, policy, and invalid-input errors invoke the provider
once. Assert 429, 408, 409, and 5xx failures may use the configured fallback.
Assert timeout fallback follows `fallbackOnTimeout`. Assert a fallback identical
to the primary provider and model is skipped.

- [ ] **Step 2: Run the focused tests**

```bash
npx vitest run tests/agents/runtime-execute.test.ts --reporter=verbose
```

Expected: the current executor falls back after any error.

- [ ] **Step 3: Implement pure classification**

Classify from typed provider fields and named internal error classes. Unknown
errors default to `unknown`, which is not fallback-eligible.

- [ ] **Step 4: Apply the policy in `executeAiTask`**

Only `rate_limit`, `transient`, and policy-enabled `timeout` may enter fallback.
Preserve the original error if no fallback is eligible.

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/agents/runtime-execute.test.ts tests/agents/provider-error.test.ts --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add agents/runtime/error-classification.ts agents/runtime/execute.ts agents/runtime/types.ts tests/agents/runtime-execute.test.ts
git commit -m "fix(ai): restrict fallback to recoverable failures"
```

### Task 4: Enforce one end-to-end deadline

**Files:**
- Modify: `agents/runtime/execute.ts`
- Modify: `agents/runtime/types.ts`
- Test: `tests/agents/runtime-execute.test.ts`

**Interfaces:**
- Produces: `deadlineAt` internal execution timestamp
- Changes: fallback timeout becomes `min(fallback.timeoutMs, remainingMs)`

- [ ] **Step 1: Add failing fake-timer tests**

Use a 15-second primary and 25-second fallback. Consume 14 seconds in primary,
then assert the fallback receives a signal that aborts after the remaining
one-second chain budget, not after 25 seconds.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/agents/runtime-execute.test.ts -t "end-to-end deadline" --reporter=verbose
```

- [ ] **Step 3: Implement remaining-time calculation**

Create the chain deadline from the primary policy. `attemptInvoke` accepts an
explicit `timeoutMs`; reject before persistence when `timeoutMs <= 0`.

- [ ] **Step 4: Verify all runtime tests**

```bash
npx vitest run tests/agents/runtime-execute.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add agents/runtime/execute.ts agents/runtime/types.ts tests/agents/runtime-execute.test.ts
git commit -m "fix(ai): bound fallback by request deadline"
```

### Task 5: Add fail-closed paid-provider access control

**Files:**
- Create: `agents/runtime/provider-access.ts`
- Modify: `agents/runtime/providers/openai.ts`
- Modify: `agents/runtime/providers/anthropic.ts`
- Modify: `agents/clients/anthropic.ts`
- Modify: `agents/runtime/providers/deepseek.ts`
- Modify: `agents/runtime/providers/voyage.ts`
- Modify: `agents/clients/google.ts`
- Modify: `agents/runtime/providers/structured.ts`
- Modify: `agents/runtime/providers/text.ts`
- Create: `tests/agents/provider-access.test.ts`
- Modify: `tests/agents/openai-structured.test.ts`
- Modify: `tests/agents/deepseek-provider.test.ts`
- Modify: `tests/agents/anthropic-provider.test.ts`
- Create or modify: a focused Google client test under `tests/agents/`

**Interfaces:**
- Produces: `PaidProviderAccessBlockedError`
- Produces: `assertPaidProviderAccess({ provider, transportWasInjected })`
- Opt-in: `TROPHE_ALLOW_PAID_AI=1`

- [ ] **Step 1: Write failing access-control tests**

Assert non-production execution without injected transport throws before fetch.
Assert an injected mock transport is allowed with all provider keys unset.
Assert Vercel production is allowed. Assert the error names only the provider
and contains no key, prompt, arbitrary caller text, or environment dump. Cover
OpenAI, Anthropic, DeepSeek, Voyage, and Google Gemini.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/agents/provider-access.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement access policy**

Use:

```ts
const liveAllowed =
  process.env.VERCEL_ENV === 'production' ||
  process.env.TROPHE_ALLOW_PAID_AI === '1';
```

An explicitly injected transport is considered offline and allowed. All other
non-production live transport is blocked. The guard runs before reading an API
key or constructing an SDK client. Only the exact string `1` is an opt-in.

- [ ] **Step 4: Inject transport through every paid adapter and dispatcher**

Add optional `fetchImpl` at the adapter boundary and propagate it through
`invokeStructuredProvider` and `invokeTextProvider`. Production call sites omit
it; tests and the offline harness provide it. Update existing provider tests to
pass their mock as `fetchImpl` instead of replacing global fetch. Google uses an
injected `generateContent`-equivalent boundary, does not construct
`GoogleGenAI` in offline mode, and receives the exact runtime `AbortSignal`.

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/agents/provider-access.test.ts tests/agents/openai-structured.test.ts tests/agents/anthropic-provider.test.ts tests/agents/deepseek-provider.test.ts --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add agents/runtime/provider-access.ts agents/runtime/providers agents/clients/anthropic.ts agents/clients/google.ts tests/agents
git commit -m "feat(ai): block unapproved paid-provider access"
```

### Task 6: Gate every direct paid-AI tool and evaluation entry point

**Files:**
- Create: `scripts/safety/tool-policy-manifest.json`
- Create: `scripts/safety/require-paid-ai-approval.ts`
- Create: `scripts/ci/check-paid-ai-tools.mjs`
- Create: `tests/enterprise/paid-ai-tool-guard.test.ts`
- Modify: paid AI entry points discovered under `agents/evals`, `scripts/eval`,
  `scripts/debug`, and `scripts/ingest`
- Modify: `package.json`

**Interfaces:**
- Produces: `requirePaidAiToolApproval({ operation, argv, env })`
- Produces: a per-run attempt counter that refuses calls beyond the approved
  maximum count or USD ceiling
- Opt-in: exact `TROPHE_ALLOW_PAID_AI=1`, `--live`, exact target, run ID,
  maximum calls, maximum estimated USD, and operation/run-bound acknowledgement
- Produces: `npm run guard:paid-ai-tools`

- [ ] **Step 1: Build the authoritative entry-point inventory**

Discover scripts that directly call a paid provider, invoke a production AI
route, or invoke a production provider adapter. Include direct DeepSeek/Voyage
tools and production food-parse evaluation scripts. Dry-run-only paths may
remain usable without approval only when tests prove they cannot reach a paid
transport.

Record every classified executable in the language-neutral
`scripts/safety/tool-policy-manifest.json`. Each path has one owner and may
declare both `paid-ai` and `production-write` policies; Task 5 of the security
plan consumes the same manifest rather than creating a competing inventory.
Shell entry points invoke the Node guard CLI before any paid or mutating step.

- [ ] **Step 2: Write failing guard tests**

For every inventoried entry point, assert missing or non-exact opt-in throws
before credential lookup, HTTP, SDK construction, production authentication,
or report mutation. Assert the error contains only a fixed operation ID.
Also reject missing/malformed `--live`, `--target`, `--run-id`, `--max-calls`,
`--max-usd`, or `--ack` inputs. Prove the per-run counter cannot exceed either
ceiling and that the typed acknowledgement is bound to the fixed operation and
run ID. Production `VERCEL_ENV` alone is never an authorization.

- [ ] **Step 3: Wire the shared guard**

Require explicit approval even when a tool targets a production Vercel route;
production server authorization must not implicitly authorize a local batch
script. Do not use `NODE_ENV`, `VERCEL_ENV`, key presence, or a truthy value as
tool approval. Every paid attempt must consume from the returned run counter
before transport. Refuse unbounded datasets and default live-capable evaluation
tools to a one-case canary unless the explicit call ceiling is lower. The tool
must reject before any paid attempt when its conservative estimate would exceed
the declared USD ceiling.

- [ ] **Step 4: Add and run the static guard**

```bash
npm run guard:paid-ai-tools
npx vitest run tests/enterprise/paid-ai-tool-guard.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add scripts/safety scripts/eval scripts/debug scripts/ingest agents/evals tests/enterprise/paid-ai-tool-guard.test.ts package.json
git commit -m "feat(ai): require approval for paid AI tools"
```

### Task 7: Build the offline provider-contract harness

**Files:**
- Create: `agents/evals/offline/types.ts`
- Create: `agents/evals/offline/scenarios.ts`
- Create: `agents/evals/offline/run-provider-contracts.ts`
- Create: `tests/fixtures/ai-provider-contracts/openai.json`
- Create: `tests/fixtures/ai-provider-contracts/anthropic.json`
- Create: `tests/agents/offline-provider-contracts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `runOfflineProviderContracts(): OfflineContractReport`
- Produces: `npm run evals:offline:providers`
- Writes: `docs/quality/ai-provider-contracts.json`

- [ ] **Step 1: Define and test the report schema**

```ts
interface OfflineScenarioResult {
  id: string;
  provider: 'openai' | 'anthropic';
  passed: boolean;
  attempts: number;
  fallbackUsed: boolean;
  category: string;
  usage: AiUsage;
  estimatedCostUsd: number;
  leakedSentinel: boolean;
}
```

Assert the report title is exactly `offline provider-contract evaluation`.

- [ ] **Step 2: Add sanitized fixtures**

Fixtures cover success, cache read/write, 403, 429, 503, abort, malformed JSON,
missing tool call, schema failure, and fallback exhaustion. Use the sentinel
`SENSITIVE_SENTINEL_DO_NOT_LOG` to verify redaction.

- [ ] **Step 3: Run the focused test and prove red**

```bash
npx vitest run tests/agents/offline-provider-contracts.test.ts --reporter=verbose
```

- [ ] **Step 4: Implement fixture transports**

The transport returns `Response` objects or throws transport errors from fixture
definitions. It calls production provider adapters with `fetchImpl`, never a
separate response parser.

- [ ] **Step 5: Add the script**

```json
"evals:offline:providers": "tsx agents/evals/offline/run-provider-contracts.ts"
```

- [ ] **Step 6: Verify zero-network execution**

Run with all provider keys unset:

```bash
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY -u VOYAGE_API_KEY npm run evals:offline:providers
```

Expected: exit 0, all scenarios pass, and the report declares offline evidence.

- [ ] **Step 7: Commit**

```bash
git add agents/evals/offline tests/fixtures/ai-provider-contracts tests/agents/offline-provider-contracts.test.ts package.json docs/quality/ai-provider-contracts.json
git commit -m "test(ai): add zero-spend provider contract evaluation"
```

### Task 8: Final AI verification and documentation

**Files:**
- Modify: `agents/README.md`
- Create: `docs/quality/ai-runtime-final-2026-07-25.md`

- [ ] **Step 1: Run AI-focused suites**

```bash
npx vitest run tests/agents tests/api/food-parse.test.ts tests/api/conversation.test.ts tests/api/photo-analyze-contract.test.ts --reporter=verbose
npm run evals:offline:providers
```

- [ ] **Step 2: Update runtime documentation**

Document typed errors, end-to-end deadlines, fallback eligibility, injectable
offline transports, and `TROPHE_ALLOW_PAID_AI=1`. State that mock results do not
measure live quality.

- [ ] **Step 3: Record evidence**

Include scenario count, pass rate, route-policy matrix, cost-accounting cases,
and proof that provider keys were unset.

- [ ] **Step 4: Commit**

```bash
git add agents/README.md docs/quality/ai-runtime-final-2026-07-25.md
git commit -m "docs(ai): record zero-spend runtime verification"
```

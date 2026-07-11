# Provider Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare a draft PR that retains provider diagnostics, adds policy-bound prompt caching, and makes manual provider preflight cover primary/fallback entitlement, read-only batch capability, and supported balance evidence.

**Architecture:** Provider adapters emit a shared safe diagnostic type and only the request IDs actually observed or sent. The runtime persists those fields in existing `agent_runs` columns/metadata. Stable prompt prefixes are marked in the provider wire adapters. A standalone policy-derived preflight script owns main-only manual workflow probes with step-scoped secrets.

**Tech Stack:** TypeScript, Next.js, Vitest, GitHub Actions, OpenAI Chat Completions, Anthropic Messages, Voyage Embeddings.

---

## Task 1: Provider diagnostics contract

**Files:**
- Create: `agents/runtime/providers/errors.ts`
- Modify: `agents/runtime/types.ts`
- Modify: `agents/runtime/execute.ts`
- Modify: `agents/runtime/persistence.ts`
- Test: `tests/agents/runtime-execute.test.ts`
- Test: `tests/agents/runtime-persistence.test.ts`

- [x] Write failing tests that require `generationId` in the invoke args, safe provider IDs on completion, and status/code/type/request IDs on failure persistence.
- [x] Run the targeted tests and confirm the expected failures.
- [x] Implement `AiProviderError`, optional `ProviderResult.providerRequestId/clientRequestId`, invoke propagation, and metadata persistence without a schema change.
- [x] Run the targeted tests green.
- [x] Commit atomically.

## Task 2: OpenAI diagnostics and explicit cache breakpoint

**Files:**
- Modify: `agents/runtime/providers/openai.ts`
- Modify: `agents/runtime/providers/structured.ts`
- Modify: structured-provider call sites that forward `clientRequestId`
- Test: `tests/agents/openai-structured.test.ts`

- [x] Write failing tests for unique per-attempt `X-Client-Request-Id`, retained `x-request-id`, structured/network error fields, stable cache key, explicit system breakpoint, 30-minute policy, and cache accounting.
- [x] Run the targeted test and confirm failure.
- [x] Implement the minimal Chat Completions request/response changes using the selected policy prompt version as the cache identity.
- [x] Run the targeted tests green.
- [x] Commit atomically.

## Task 3: Anthropic structured cache and diagnostics parity

**Files:**
- Modify: `agents/runtime/providers/anthropic.ts`
- Modify: `agents/runtime/providers/structured.ts`
- Test: `tests/agents/anthropic-structured.test.ts`

- [x] Write failing tests for request-ID retention, typed/malformed failures, and `cache_control` only when `policy.cacheSystem` is true.
- [x] Run the targeted tests and confirm failure.
- [x] Implement the adapter/dispatcher changes without changing models or fallback policy.
- [x] Run the targeted tests green.
- [x] Commit atomically.

## Task 4: Tested provider preflight and read-only batch probes

**Files:**
- Create: `scripts/ops/provider-preflight.ts`
- Modify: `.github/workflows/provider-smoke.yml`
- Modify: `package.json`
- Test: `tests/agents/provider-preflight.test.ts`
- Test: `tests/agents/deepseek-eval-contract.test.ts`

- [x] Write failing mocked-HTTP tests for all policy-derived lane checks, OpenAI/Anthropic/Voyage read-only batch listing, DeepSeek model/balance checks, non-zero usage, request-ID output, and fail-closed behavior.
- [x] Run the targeted tests and confirm failure.
- [x] Extract the workflow logic into the script and wire the workflow to it. Do not create a batch or make production calls locally.
- [x] Run the targeted tests green.
- [x] Commit atomically.

## Task 5: Full verification and draft PR

- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Review the complete diff for secret leakage, route changes, production writes, and scope creep.
- [ ] Push `agent/provider-hardening` and open a draft PR with verification evidence and explicit `NO MERGE / NO DEPLOY` language.
- [ ] Pause for human review.

Plan complete and approved for prepare-only execution in this session. Merge/deploy remain separate decisions.

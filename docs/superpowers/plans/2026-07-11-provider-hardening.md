# Provider Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare a draft PR that retains provider diagnostics, adds policy-bound prompt caching, and makes manual provider preflight cover primary/fallback entitlement, read-only batch capability, and supported balance evidence.

**Architecture:** Provider adapters emit a shared safe diagnostic type and optional request IDs. The runtime persists those fields in existing `agent_runs` columns/metadata. Stable prompt prefixes are marked in the structured-provider wire adapters. A standalone tested preflight script owns manual workflow probes.

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

- [ ] Write failing tests that require `generationId` in the invoke args, safe provider IDs on completion, and status/code/type/request IDs on failure persistence.
- [ ] Run the targeted tests and confirm the expected failures.
- [ ] Implement `AiProviderError`, optional `ProviderResult.providerRequestId/clientRequestId`, invoke propagation, and metadata persistence without a schema change.
- [ ] Run the targeted tests green.
- [ ] Commit atomically.

## Task 2: OpenAI diagnostics and explicit cache breakpoint

**Files:**
- Modify: `agents/runtime/providers/openai.ts`
- Modify: `agents/runtime/providers/structured.ts`
- Modify: structured-provider call sites that forward `clientRequestId`
- Test: `tests/agents/openai-structured.test.ts`

- [ ] Write failing tests for `X-Client-Request-Id`, retained `x-request-id`, structured error fields, stable cache key, explicit system breakpoint, 30-minute policy, and cache-write accounting.
- [ ] Run the targeted test and confirm failure.
- [ ] Implement the minimal Chat Completions request/response changes using the selected policy prompt version as the cache identity.
- [ ] Run the targeted tests green.
- [ ] Commit atomically.

## Task 3: Anthropic structured cache and diagnostics parity

**Files:**
- Modify: `agents/runtime/providers/anthropic.ts`
- Modify: `agents/runtime/providers/structured.ts`
- Test: `tests/agents/anthropic-structured.test.ts`

- [ ] Write failing tests for request-ID retention, typed failures, and `cache_control` only when `policy.cacheSystem` is true.
- [ ] Run the targeted tests and confirm failure.
- [ ] Implement the adapter/dispatcher changes without changing models or fallback policy.
- [ ] Run the targeted tests green.
- [ ] Commit atomically.

## Task 4: Tested provider preflight and read-only batch probes

**Files:**
- Create: `scripts/ops/provider-preflight.ts`
- Modify: `.github/workflows/provider-smoke.yml`
- Modify: `package.json`
- Test: `tests/agents/provider-preflight.test.ts`
- Test: `tests/agents/deepseek-eval-contract.test.ts`

- [ ] Write failing mocked-HTTP tests for all required lane checks, OpenAI/Anthropic/Voyage read-only batch listing, DeepSeek model/balance checks, non-zero usage, request-ID output, and fail-closed behavior.
- [ ] Run the targeted tests and confirm failure.
- [ ] Extract the workflow logic into the script and wire the workflow to it. Do not create a batch or make production calls locally.
- [ ] Run the targeted tests green.
- [ ] Commit atomically.

## Task 5: Full verification and draft PR

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Review the complete diff for secret leakage, route changes, production writes, and scope creep.
- [ ] Push `agent/provider-hardening` and open a draft PR with verification evidence and explicit `NO MERGE / NO DEPLOY` language.
- [ ] Pause for human review.

Plan complete and approved for prepare-only execution in this session. Merge/deploy remain separate decisions.

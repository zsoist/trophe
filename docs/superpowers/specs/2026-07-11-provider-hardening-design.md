# Provider Hardening — Design Spec (2026-07-11)

**Status:** Approved by the 2026-07-11 prepare-only work order. Implementation may proceed on a draft branch; merge and deploy remain separately gated.

## Goal

Make provider failures diagnosable and preflight both sides of every active AI lane without changing routing. Preserve the provider HTTP status, machine-readable error type/code, provider request ID, and—where supported—the exact app-generated client request ID sent on that HTTP attempt; explicitly cache stable Luna/Haiku prompt prefixes; and prove synchronous, batch, entitlement, and balance signals before a canary or eval is accepted.

## Scope and boundaries

- Draft PR only. No merge, deployment, routing mutation, production DB write, paid batch creation, or canary restart.
- Reuse `agent_runs.raw_status` and `agent_runs.metadata`; do not add columns or a migration.
- Never log credentials, prompt bodies, raw personal data, or full provider response bodies.
- The production provider smoke remains a manual, main-only GitHub workflow in the `production` environment. Production credentials exist only on the final preflight step, after dependency installation.
- GitHub and Vercel hold independently provisioned credentials. This workflow proves GitHub-environment entitlement only; a controlled post-deploy production invocation remains required to prove Vercel-runtime parity.
- A provider that does not expose a supported balance API is reported as `not_api_verifiable`; a live low-token entitlement probe is the honest substitute. No fabricated balance check.

## Design

### 1. Typed provider diagnostics

Add a shared `AiProviderError` carrying only safe diagnostic fields: provider, HTTP status, provider error type/code, provider request ID, and client request ID. OpenAI and Anthropic adapters construct it for non-2xx responses and protocol failures. `executeAiTask` supplies the generation UUID to provider call sites; OpenAI derives a unique `X-Client-Request-Id` for every HTTP attempt. IDs are persisted only when the adapter confirms they were received or sent—`generation_id` remains the internal correlation key. After a validated HTTP-200 response, protocol errors also carry safe generation, usage-bucket, and latency evidence so a paid failed attempt is recorded and charged to the budget before fallback. Raw response bodies, validator details, and nested causes are deliberately excluded.

This closes the 2026-07-11 diagnostic gap while preserving the original thrown error and fallback behavior.

### 2. Explicit cache boundaries

- OpenAI Luna Chat Completions: stable `prompt_cache_key` derived from the policy prompt version, request-wide explicit mode with `30m` TTL, and one explicit breakpoint after the stable system content block. Variable user text stays after the breakpoint. Capture both cache-read and cache-write token counters.
- Anthropic structured and text calls: honor the existing `policy.cacheSystem` flag by representing the system prompt as a text block with `cache_control: { type: 'ephemeral' }` (default 5-minute TTL). Haiku 4.5 requires a 4,096-token cacheable prefix; marked shorter prompts may produce no cache activity.

Cache keys contain model/prompt-version/operation (tool) identity only, never a user ID or prompt content.

The coach/conversation system string currently appends user-specific memory and knowledge. Its existing `cacheSystem` flag therefore marks a dynamic block, not a guaranteed reusable prefix. Cache effectiveness and any future static/dynamic split must be measured in a separate cache-engineering work order; this patch makes accounting accurate but does not claim coach-lane cache savings.

### 3. Provider preflight

Refactor the workflow's inline checks into a tested script. It will:

- derive every required model from `taskPolicies` plus `taskFallbacks`, fail closed if an active model lacks a supported probe, and avoid legacy-provider calls that are not routed;
- issue a minimal live generation for the active OpenAI, Anthropic, and DeepSeek models, plus a minimal Voyage embedding for the active memory lane;
- require provider generation identity and non-zero authoritative token usage, and print the safe generation/request/client IDs, latency, and token receipt;
- list OpenAI batches (`GET /v1/batches?limit=1`), Anthropic message batches, and Voyage embedding batches without creating paid work;
- verify DeepSeek required model aliases and its supported `/user/balance` availability signal;
- classify each check as credential, entitlement, batch-capability, or balance evidence and fail the workflow on any required check.

OpenAI, Anthropic, and Voyage do not expose an application balance endpoint in the supported public APIs used here. Their preflight therefore reports balance as console-managed/not API-verifiable and proves spend entitlement through a bounded generation or embedding call. Auto-reload and low-balance alerts remain human console controls.

## Verification

- Adapter unit tests prove unique per-attempt request headers, error metadata, cache request shape, cache usage/cost accounting, malformed-root handling, and no secret leakage.
- Runtime/persistence tests prove diagnostics survive both failed and successful attempts, including fallback.
- Preflight tests use mocked HTTP only and prove required capability failures make the script exit non-zero.
- Full repository gate: `npm run typecheck && npm run lint && npm test && npm run build`.

## Not included

Routing changes, provider console settings, canary execution, production DB changes, real Batch API jobs, automated balance scraping, or Greek/Colombian reference-data changes. Runtime typed-diagnostic conversion for the DeepSeek factory and Voyage embedding adapters is also a follow-up; this patch covers their entitlement/capability preflight but does not claim their runtime adapters retain the same evidence as OpenAI/Anthropic.

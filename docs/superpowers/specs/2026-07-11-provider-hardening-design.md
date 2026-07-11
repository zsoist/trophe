# Provider Hardening — Design Spec (2026-07-11)

**Status:** Approved by the 2026-07-11 prepare-only work order. Implementation may proceed on a draft branch; merge and deploy remain separately gated.

## Goal

Make provider failures diagnosable and preflight both sides of every active AI lane without changing routing. Preserve the provider HTTP status, machine-readable error type/code, provider request ID, and an app-generated client request ID; explicitly cache stable Luna/Haiku prompt prefixes; and prove synchronous, batch, entitlement, and balance signals before a canary or eval is accepted.

## Scope and boundaries

- Draft PR only. No merge, deployment, routing mutation, production DB write, paid batch creation, or canary restart.
- Reuse `agent_runs.raw_status` and `agent_runs.metadata`; do not add columns or a migration.
- Never log credentials, prompt bodies, raw personal data, or full provider response bodies.
- The production provider smoke remains a manual GitHub workflow in the `production` environment.
- A provider that does not expose a supported balance API is reported as `not_available`; a live low-token entitlement probe is the honest substitute. No fabricated balance check.

## Design

### 1. Typed provider diagnostics

Add a shared `AiProviderError` carrying only safe diagnostic fields: provider, HTTP status, provider error type/code, provider request ID, and client request ID. OpenAI and Anthropic adapters construct it for non-2xx responses and protocol failures. `executeAiTask` supplies the generation UUID to adapters as the app-side client request ID. On success, provider request IDs travel in `ProviderResult`; on failure, `failGeneration` writes the status and safe fields into existing `agent_runs` metadata.

This closes the 2026-07-11 diagnostic gap while preserving the original thrown error and fallback behavior.

### 2. Explicit cache boundaries

- OpenAI Luna Chat Completions: stable `prompt_cache_key` derived from the policy prompt version, request-wide explicit mode with `30m` TTL, and one explicit breakpoint after the stable system content block. Variable user text stays after the breakpoint. Capture both cache-read and cache-write token counters.
- Anthropic structured calls: honor the existing `policy.cacheSystem` flag by representing the system prompt as a text block with `cache_control: { type: 'ephemeral' }`. This brings the structured path to parity with the existing text client.

Cache keys contain model/prompt-version identity only, never a user ID or prompt content.

### 3. Provider preflight

Refactor the workflow's inline checks into a tested script. It will:

- issue a minimal live generation for OpenAI Luna, Anthropic Haiku, Google Gemini, and DeepSeek factory routing;
- require provider generation identity and non-zero authoritative token usage for the active Luna/Haiku lanes;
- list OpenAI batches (`GET /v1/batches?limit=1`) and Anthropic message batches without creating paid work;
- verify DeepSeek required model aliases and its supported `/user/balance` availability signal;
- classify each check as credential, entitlement, batch-capability, or balance evidence and fail the workflow on any required check.

OpenAI and Anthropic do not expose an application balance endpoint in the supported public APIs used here. Their preflight therefore reports balance as console-managed/not API-verifiable and proves spend entitlement through the bounded generation call. Auto-reload and low-balance alerts remain human console controls.

## Verification

- Adapter unit tests prove request headers, error metadata, cache request shape, cache usage accounting, and no secret leakage.
- Runtime/persistence tests prove diagnostics survive both failed and successful attempts, including fallback.
- Preflight tests use mocked HTTP only and prove required capability failures make the script exit non-zero.
- Full repository gate: `npm run typecheck && npm run lint && npm test && npm run build`.

## Not included

Routing changes, provider console settings, canary execution, production DB changes, real Batch API jobs, automated balance scraping, or Greek/Colombian reference-data changes.

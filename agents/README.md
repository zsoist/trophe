# /agents — LLM Surface

Single source of truth for all LLM-backed features. Routes stay thin, prompts stay versioned.

## Structure

```
agents/
  prompts/<agent>.<version>.md    # Prompt templates (versioned, git-diffable)
  clients/<provider>.ts           # Thin API wrappers (anthropic, gemini)
  schemas/<agent>.ts              # Input/output types + runtime validators
  <agent>/
    index.ts                      # Public `run(input)` — the only export routes use
    extract.ts                    # Output parsing / normalization
    enrich.ts                     # Post-processing (DB lookups, canonicalization)
```

## Current agents

| Agent | Prompt | Model | Cache |
|---|---|---|---|
| food-parse | `prompts/food-parse.v3.md` | claude-haiku-4-5-20251001 | ephemeral (system) |

## Adding a new agent

1. **Prompt** — create `prompts/<agent>.v1.md`. Use `{{PLACEHOLDER}}` for any runtime-injected content.
2. **Schema** — create `schemas/<agent>.ts` with input + output TypeScript types.
3. **Agent** — create `<agent>/index.ts` exporting `run(input): Promise<RunResult>`.
4. **Route** — edit `app/api/<path>/route.ts` to validate input, call `run()`, return the response. Routes should be under 60 lines.

## Prompt versioning

Bump the version number in the filename (`v3` → `v4`) whenever the prompt changes rules or output shape. The filename is imported in `<agent>/index.ts` at module init — a version bump is a code change, visible in every PR.

Do NOT edit an in-use prompt in place. Copy to `vN+1.md`, update the agent import, ship. This keeps rollback trivial (change the import back).

## Prompt caching

`clients/anthropic.ts` supports `cacheSystem: true` which wraps the system prompt in Anthropic's `cache_control: { type: 'ephemeral' }`. The stable prefix (rules, reference data, examples) is cached server-side for ~5 minutes, making subsequent calls within that window ~10% of normal cost.

Use when: system prompt is ≥2048 tokens AND requests arrive in bursts (typical user sessions). Skip when: single isolated calls or small prompts.

## Telemetry

Every `run()` returns a `telemetry` object with tokens in/out, cache-creation tokens, cache-read tokens, latency, and raw HTTP status. Routes should pass this to `logAPIUsage` so cost and cache-hit rates show up in our dashboards.

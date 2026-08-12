# Task 6 report — mechanically enforced paid-tool boundary

Implementation: `222f21d6ef4c02680469697b1079563db0aef696`

Round-1 fix: `a27640233fd71398e26aa383186f01d3a0ed7349`
(`fix(ai): enforce paid transport budgets`)

Round-2 fix: this commit
(`fix(ai): close paid tool bypasses`)

## Outcome

The Critical scanner finding and all valid Important findings in
`task-6-rereview-1.md` are closed:

- Paid executables are discovered from every package script target, every
  repository-wide shebang, every manifest row, and repository-wide main/top-
  level execution regardless of directory.
- The cycle-safe graph follows ESM imports/re-exports, CommonJS `require`,
  literal dynamic imports, aliases, barrels, and extension/index resolution.
  A paid graph with a non-literal load fails closed.
- Paid host/route strings count only when used by an actual transport sink, so
  comments and documentation remain inert. Direct paid `fetch` and low-level
  provider imports outside the approved facade are rejected.
- A reachable approval bootstrap must dominate sensitive boundaries and match
  the manifest operation. Dead-function bootstraps, renamed provider imports,
  forged/no-op callbacks, missing capability flow, and multiline shell
  `|| true` fail closed.
- Executable tools import providers through
  `scripts/safety/paid-ai-provider-facade.ts`. Explicit production dispatchers
  remain scanner-allowlisted and preserve normal application behavior.
- Approval counters mint callbacks into a module-private `WeakSet`. Every owned
  provider transport validates provenance and debits immediately before each
  request/retry. Production calls that do not supply a Task 6 callback remain
  unchanged.
- Google live transport no longer delegates retry/redirect behavior to
  `@google/genai`: one owned raw `fetch` uses `redirect: 'error'`, no internal
  retry, the exact abort signal, strict response parsing, and preserved
  structured-response and usage contracts.
- The Phase-2 Mistral compatibility path moved from a tool-local global fetch
  shim into the owned OpenAI-compatible provider boundary, where endpoint
  identity, request mapping, redirect rejection, and capability debit are
  covered by an offline wire test.
- DeepSeek stress pricing now has one versioned source shared by router and
  approval. Official flash `$0.14/$0.28` and pro `$0.435/$0.87` rates drive both
  tested maximum envelopes. The 16,384-token input ceiling is fixed by the tool
  contract and cannot be lowered by caller environment.
- The accidental five-item production schema limit is removed; a valid six-item
  meal passes Zod and the Google response schema has no `maxItems`.
- Because production response cardinality is intentionally unbounded, opaque
  food-route evaluators reserve an impossible 1,001-attempt envelope and fail
  before dotenv, credentials, authentication, database, or transport. This
  preserves product behavior while refusing an unprovable `$3` envelope.
- Every configurable food-route URL goes through one low-cardinality resolver
  before `new URL` data can reach diagnostics. Sentinel child-process tests
  cover all six bootstraps.

## RAG `localDb` reviewer disposition

The re-review requested `scripts/rag/ingest-document.ts` be changed to
`localDb: true` because it imports database code. That recommendation is not
adopted: the shared security-plan definition says `localDb: true` means the
executable enforces a canonical loopback-only database target. RAG ingestion
does not yet impose that target restriction and can accept a remote database,
so `localDb: false` is the safe classification.

The manifest now states this semantic explicitly:

```text
true only when the executable enforces a loopback-only database target
```

A permanent semantic regression test keeps the RAG row false until a separate
security task adds and proves loopback enforcement. Classification therefore
describes target restriction, not whether a module imports database code.

## Permanent mutation evidence

The scanner regressions prove rejection of:

1. a package target plus shebang under `tools/`;
2. a direct paid-host `fetch`;
3. a dead guard with renamed provider alias and forged no-op capability;
4. a paid graph with computed dynamic import;
5. a CommonJS low-level provider import;
6. a multiline shell guard ending in `|| true`;
7. the prior alias/barrel/dynamic/cycle, dotenv-order, dead-consume, and hidden
   RAG executable cases.

## Fresh verification

All commands were run offline without provider credentials, paid-tool opt-in,
database access, production/auth access, deployment, merge, push, or network:

```text
node scripts/ci/check-paid-ai-tools.mjs
exit 0

Focused guard/review/Google suite
Test Files  4 passed
Tests       88 passed

Full offline Vitest suite
Test Files  87 passed, 1 skipped
Tests       886 passed, 33 skipped

npm run typecheck
exit 0

npm run lint
exit 0 (17 unrelated existing warnings, 0 errors)
```

Final cached-diff and staged-path checks are recorded at commit time. Provider
spend: `$0.00`.

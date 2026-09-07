# Authorized-record engine in disposable Auth CI

AG1 agreed exact guards: CI=true, GITHUB_ACTIONS=true, CI_REAL_SUPABASE=1;
COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED=1; COACH_ASSISTANT_DATA_SOURCE=authorized_records;
VERCEL_ENV must not be production; TROPHE_ALLOW_PAID_AI must not be1.
DATABASE_URL must be postgresql://<local auth>@127.0.0.1:54322/postgres without
query/hash; NEXT_PUBLIC_SUPABASE_URL must be http://127.0.0.1:54321/ without
credentials/query/hash. Matches current disposable harness; no script import
into the app and no credential output.

AG1 route composition (route remains AG1-owned): when the explicit flag is1,
call createIsolatedCoachEngineBinding(process.env) from isolated-engine.ts and
pass its result as handler dependency isolatedEngine. When off, omit it. Keep
existing guardAiRoute, actual createServerRepository, actor allowlist, deadline,
no-store and all production exclusions. No request JSON selects a provider,
repository, actor, tenant, capability or fixture configuration. Invalid server
configuration fails closed before any model/network call.

The factory composes the REAL v5.1 candidate engine with a FIXED deterministic
fixture transport containing no fetch/SDK/key lookup. There is no transport
argument or provider fallback. A private WeakMap capability ties the exact
transport identity to validated CI targets; engine and generator must validate
that capability to accept authorized_records. Object-shaped or JSON capability
forgeries and transport substitution fail closed. Environment validity is
rechecked at use, not just construction. Ordinary candidate provider injection
remains synthetic-only and cannot use this authorized-record exception.

The repository/dataSource/actor remain actual authorized records. The response
explicitly labels evaluation.transport=injected_fixture and
records=authorized_records; the answer labels isolated transport fixture
execution. Model capability remains not_connected. Telemetry usage/modelCalls
here counts deterministic fixture invocation and fixed diagnostic fixture tokens,
not real provider usage, quality, price or account model availability. No API
transport is invoked. Typed canonical facts are rendered from the actual reads;
the fixture creates no numeric facts, actions, proposals or receipts.

Memory compatibility: run forwards the existing filterMemoryHistory option to
the actual engine. Current memory broker reading, scoped snapshot signature,
monotonic tombstone revision and stale-derived filtering are preserved when
AG1 integrates the separate memory slice. A local combined test confirms the
actual pre-generation filter removes a prior signed assistant snippet after
memory deletion while preserving literal user history. No claim of persistence
or RLS follows from that injected repository/service test.

## Exact minimal delta artifact

Apply AFTER engine-v5.1.patch SHA256
2365cc93cf7eaeb7b4561a60e60e7e27e7f685de34b697d858603facaaad3c86:
/Volumes/SSD/TROPHE_DUAL_AGENTS_R1/control/ag3/authorized-engine/authorized-engine.patch
SHA256 20c1afc0851e41a4609297a7ab74cddc6df631256d5e228701cc0ab23eb12e18
Eight files; sibling manifest.json binds old/new hashes. Delta excludes the
unintegrated memory service and its test, routes/UI, schema/DDL and CI. It composes
on the accepted minimal engine instead of importing unrelated AG3 branch work.

Applied and checked only in a file-only copy of the accepted AG1 bundle. Commands:
NODE AG1/node_modules/vitest/vitest.mjs run --config control/ag3/authorized-engine/vitest.config.mjs
NODE AG1/node_modules/typescript/bin/tsc -p control/ag3/authorized-engine/tsconfig.json --pretty false
67 tests passed and scoped TypeScript passed. Current AG3 memory-turn suite also
passed5 tests including actual-engine token compatibility. Global fetch is made
to throw in the authorized handler test; no network call occurs.

These are real engine and Request/Response tests with injected Auth/repository,
not real HTTP/Auth/SQL. AG1 must bind the route in its current disposable harness,
add authorized UI/HTTP checks after current Food gates, and record the exact CI
candidate. AG4 independently reviews this delta. No production activation or
paid/Luna-quality approval is conveyed by this delivery.

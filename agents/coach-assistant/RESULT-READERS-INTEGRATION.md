# Memory and dietary preference browser readers

New pure response readers; no contract, route or UI changes.

- `readPersistentMemoryResult(unknown)` / `persistentMemoryResultReader.safeParse`
- `readFoodPreferenceResult(unknown)` / `foodPreferenceResultReader.safeParse`

`read...` returns the typed parsed result or null; safeParse returns
`{success:true,data}` or `{success:false}`. Inputs are already-parsed JSON.
All runtime imports point only to `result-reader-checks.ts`. Contract imports
are `import type`; no Zod, database, crypto, provider or full coach-schema runtime
is introduced into the browser graph. The earlier Food quantity reader is unchanged.

Readers match the authoritative result schemas, including strict nested objects,
UUID/calendar-aware datetime formats, revision/string/array bounds, nullable
values, all result variants and optional dietary refresh. Memory text is trimmed
exactly like its existing Zod schema and copied without mutating input. Sparse
arrays are rejected as the server rejects missing elements.

These are shape readers, not authorization or action validation. A valid UUID
does not prove current thread/profile ownership. Preserve existing server checks
and controller correlation of request/action/proposal/resource IDs, current scope
and version. Do not infer a successful applied operation merely from structural
acceptance; receipt status and refresh semantics retain their existing meaning.

Four differential tests compare every variant, nested field mutations, unknown
keys, omitted fields, trim transformations, malformed dates/UUIDs, array bounds,
mixed variants and optional/required refresh against current authoritative Zod.
Scoped TypeScript/lint pass. No bundler build, UI exercise, DB, or API call was run.
US$0; root dependencies and application flags unchanged.

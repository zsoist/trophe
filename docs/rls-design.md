# Row-Level Security Design

## Operational Tables

The following operational tables are intentionally write-via-server/service-role only:

- `agent_runs`
- `api_usage_log`
- `agent_conversation`
- `raw_captures`

Authenticated clients may read only rows permitted by ownership, coach-assignment, or organization policies. They must never receive direct `INSERT`, `UPDATE`, or `DELETE` policies for these tables.

Server-side routes verify callers and write through the trusted database connection. This prevents clients from spoofing AI generations, costs, usage, conversation history, or ingestion records.

Do not add client-write RLS policies to make a browser insert succeed. Add or update a verified server route instead.

## Verification

`tests/db/rls.test.ts` and `tests/enterprise/invariants.test.ts` are release gates. Production schema verification runs through `npm run db:verify`.

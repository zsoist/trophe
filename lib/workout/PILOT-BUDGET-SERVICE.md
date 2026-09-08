# Persistent pilot accounting — isolated candidate

LIVE-01 now evaluates a US$3 authorized ceiling and a US$2.70 admission target on
the America/Bogota server day. The writer records an admission day per attempt,
recomputes the active ledger atomically when the date changes, excludes only prior
day settled usage, and retains every open reservation. The isolated configuration
permits one shared Ask Trophē authority row. AG1 owns the canonical migration and
hosted provisioning; AG3's isolated acceptance owns generated rows only and never
drops the table or indexes.

`createPilotBudgetStore` implements the coach port with the shared `agent_runs` table and one private configuration row per pilot. The caller identity comes from the server factory; the command cannot choose that authority. Each transaction locks configuration, rechecks allowed actors and current organization membership, validates every pilot record, and compares count/charge against the persisted aggregate before deciding. Missing or reclassified rows fail closed. Attempt IDs are globally unique; `agentRunId` is the same row ID/generation ID later used for reconciliation.

The isolated configuration defaults to a zero cap and is provisioned only by the
guarded test/operator path. It is never provisioned from a request. Productive
migrations and hosted provider wiring remain absent.

Financial states remain in `metadata.coachPilot.state`. Existing `agent_runs.status` stays within its current constraint: reserved/dispatched/unknown → pending; settled measured usage → completed; released before dispatch → failed with `pilot_cancelled_before_dispatch` and zero estimated cost. Settlement here concerns usage accounting, not answer quality or approval. Other metadata is preserved. The measured runner must reuse this row rather than create a second generation.

Unknown results retain their reservation. Supported measured overruns are charged and quarantine the pilot; unsupported usage is retained with an accounting alert. If the aggregate cannot fit the port's safe integer range, the transaction persists a pilot block and retains the prior reservation. That overflow branch does not claim the new usage/cost was recorded. No expiry or restart frees unknown charges.

Verification is separated: the pure core and writer boundary unit cases passed; `scripts/test/coach-pilot-budget-sql.ts` prepares real PostgreSQL concurrency, restart, rollback, authority, collision, charge and cleanup cases. Those SQL cases require the exact disposable GitHub loopback target. They are not a production migration or a measured API evaluation. The fixture runner executes them sequentially alongside the real Auth preference journey and removes only the generated pilot/run IDs.

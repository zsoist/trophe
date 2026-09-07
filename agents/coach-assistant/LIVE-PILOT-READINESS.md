# Live pilot readiness — blocked at US$0

Pricing documentation is not budget authorization or account access. AGG verified
on 2026-09-07 the Luna model and Standard short-context price references:
https://developers.openai.com/api/docs/models/gpt-5.6-luna
https://developers.openai.com/api/docs/pricing
Reported per million: input $0.20, cached input $0.02, cache write $0.25,
output including reasoning $1.20. No credential was accessed or live call made in
this tranche. Existing coach policy maxCostUsd remains zero.

Source inspection confirms that agents/runtime/org-budget.ts sums historical
agentRuns with missing costs coalesced to zero, without reserving an attempt
atomically. Concurrent calls can pass the same soft cap. Its daily/monthly scope
also does not express the cumulative AG3+AG4 pilot envelope.
agents/runtime/cost-reconciliation.ts currently skips non-completed runs. Aborted,
failed and unknown outcomes therefore cannot be assumed reconciled by that helper.

Before a paid smoke, reuse agentRuns and existing budget services where possible:
reserve the worst-case attempt cost in a persistent transaction under a shared
pilot cap; bind reservation to a unique attempt; prevent concurrent over-reservation;
retain unknown reservations through abort/failure/restart; reconcile using actual
usage without double-counting reasoning; release only when non-consumption is
established. Include every transport attempt, including retries. Unknown model
pricing must deny dispatch, never become zero. AG1 owns any required schema delta.

Required evidence includes concurrent cap contention, retry accounting, process
restart, response loss and an aborted attempt with unknown consumption. Arithmetic
price tests and offline usage fixtures cannot substitute for this evidence.
No money request or live enablement should imply these prerequisites already pass.

# Reviewed memory UI

The global coach exposes saved memories only when
`NEXT_PUBLIC_COACH_MEMORY_ACTIONS_ENABLED=1`, for the signed-in subject.
The server independently requires `COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED=1`.
Both remain off by default. Example conversations require an explicit injected
memory transport; they never silently use the authenticated writer.

Opening Remembered context reads the current conversation. Creating, correcting
and deleting first produce a review. Only the explicit confirmation sends apply.
A lost or cancelled apply retains its action ID; recovery asks for its receipt
and refetches current memory before permitting another mutation. Closing the
coach retains this controller. Changing account resets it. Successful refetch
clears the old editor target; uncertain or failed refetch preserves it.

Memory is currently scoped to the active conversation ID. The existing global
conversation controller creates a new ID after page reload. Durable conversation
history and reopening prior conversations are a separate pending integration;
this UI does not yet prove cross-reload access to earlier saved memories.

The browser imports the lightweight result reader, not the server Zod/schema
graph. The controller still validates reviewed values and action/receipt binding.
Build budgets must verify the actual added bytes in the candidate.

Focused tests cover controller recovery, stale review rejection, cancelled reads,
cancelled writes, explicit review/confirm, editor reset and account/thread binding.
`e2e/coach-memory.spec.ts` is prepared for the disposable Auth job while memory
DDL exists. It covers visible creation/correction/deletion plus HTTP receipt
replay, not dropped-response or post-commit cancellation in the browser.

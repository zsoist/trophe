# Shared coach — first integration

One lazy controller belongs to `ClientShell`, outside route transitions. The separate public flag defaults off. The header owns its launcher position; opening it does not replace or unmount the underlying Food or Workout form. When enabled, the legacy Workout coach entry is omitted.

| Surface | Shared implementation | Data boundary | Verified here |
| --- | --- | --- | --- |
| Food `/dashboard/log` + Workout | Same panel, conversation ID, editable draft, per-turn context | `/api/coach-assistant`, version 2; legacy version 1 remains | Mounted UI tests: navigation, explicit send, context removal |
| Authenticated client shell | Real browser auth subscription; old account subtree discarded on identity change | Cookies; server reauthorizes every requested subject | Source implementation; actual Auth journey still pending fixture 42501 |
| Private Food | Production `QuickFoodInput` manual form | Explicit in-memory example rows; no account writes | Private browser verification pending |
| Private Workout | Production workspace components and existing tab adapter | Labelled example records; deterministic summary, no model | Prior Workout verification; new shared panel verification pending |
| Requests | 45-second deadline, cancellation, stale generation discarded, failed questions recoverable | Opening/navigation never invokes transport | Targeted controller/UI tests |
| Professional subjects | Component accepts an explicit subject key and resets on change | Server scope authorization remains mandatory | Mounted reset test only; professional shell binding not connected |

Context/history are untrusted hints. Each request captures its own context. Responses are checked against conversation/turn IDs. Full UI history stays in memory (40 turns); only the last six successful messages, capped at 500 characters each, are sent as hints. Reload does not promise conversation recovery.

Profile and unconfirmed memory cards now render only when the authorized adapter supplies them. Preference duration changes require a canonical proposal, explicit confirmation and a matching receipt. The extra isolated-action flag enables only a disposable copy of preferences; account settings are never persisted by that adapter. A lost apply response keeps its action ID and offers receipt lookup rather than a blind write retry. Memory confirmation/correction/deletion, images and voice remain unconnected. No inferred intensity/fatigue, automated writes, model calls, paid services, production migrations or public activation are introduced. Offline summaries are labelled; a private injected transport is not evidence of real HTTP/Auth/model execution.

The private preference adapter uses the same transaction core as the server with the already locked SHA-256 package (now declared as a direct development dependency). No new package version or local installation was introduced. Browser storage is in memory and labelled isolated; it does not establish real Auth, RLS or persistent API behavior.

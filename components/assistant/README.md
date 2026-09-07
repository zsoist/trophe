# Shared coach — integration and evidence

One lazy controller belongs to `ClientShell`, outside route transitions. The separate public flag defaults off. Opening or navigating never invokes inference. The header owns the launcher; closing the modeless panel leaves manual Food and Workout available. There is no public activation or paid model execution in this candidate.

| Route / surface | Shared implementation and current capability | Boundary / pending |
| --- | --- | --- |
| Home `/dashboard` | Global launcher, explicit per-turn screen context | No separate Home action service |
| Food `/dashboard/log` | Same conversation and composer; Food record summaries | Private export uses production `QuickFoodInput` with labelled tab-only example rows. Recipe mutation, meal logging by coach and photo analysis not connected |
| Food / recipes | Same global controller where client shell applies | Recipe/entity-specific context and reviewed recipe writes not connected |
| Workout Home / plan / editor | Same controller, authorized summaries; reviewed preferences | Private draft controls review canonical name/sets, apply through the shared workspace boundary and verify the actual resulting workspace version. No automatic start or logging |
| Workout live | Manual logger remains independent; global launcher | Coach does not record sets, finish sessions or infer fatigue; no 3D dependency on saving sets |
| Library / exercise / Muscle Atlas | Same shell controller, Workout screen context | Exact exercise/atlas entity binding not connected. Atlas and exercise media remain separate systems |
| History / Progress | Shared launcher and bounded authorized record summaries | No dedicated history/progress mutation or recovery/fatigue inference |
| Profile / habits | Authorized profile cards; explicit preference review | Habit actions not connected. Memory confirm/correct/delete currently isolated only |
| Professional coach / client selection | Subject-key reset and server authorization contracts | Professional shell binding not connected; component tests are not an authenticated professional journey |

Context and history are untrusted hints. Every request captures its own context; the server reauthorizes the requested actor, subject and organization. Full UI history is in memory (40 turns); only six successful messages, capped at 500 characters each, are sent as hints. Closing retains the thread, but reload recovery and durable conversation storage are pending. Changing identity discards old state and cancels work.

| Capability | Read / propose / apply | Evidence and current limit |
| --- | --- | --- |
| Legacy weekly coach, v1 | Read only | Exact `4b569d6`: CI34083101177 and Auth34083650597 passed. Real disposable Supabase Auth → HTTP → SQL, flag ON/OFF each one executed UI test, verified cleanup. Supersedes the old 42501 fixture issue; does not certify v2 |
| Global conversation, v2 | Explicit messages, cancellation, failure recovery, detached context | `47f48d2` CI34083959858 passed; shared Food/Workout continuity verified in private preview. Live model not connected; offline summaries labelled |
| Preferences and memory, isolated | Canonical before/after proposal → review → matching receipt; uncertain results query the same action ID | `47f48d2` UI tests and independent mobile dark review passed. Memory source/date retained, correction/deletion invalidate old versions. Isolated copies do not update account settings |
| Durable preferences | Shared manual preference writer plus transactional proposal, version, receipt and audit | `5124084` CI34085595776 passed. Auth34086068378: eight durable SQL behavioral checks passed, but fixture cleanup failed, so the overall runtime gate failed. Cleanup correction awaits a new exact-SHA run. HTTP durable binding is separately reviewed and not certified by those SQL tests |
| Images | Local selection → explicit upload review; guarded prepare/PUT/status/remove adapter | `195101a` CI34084944336 passed. Header preflight before browser decode; server full decode/orientation/EXIF normalization. Private ownership/thread binding, 3 × 5MiB, 15MiB total, 16MP. Server storage is ephemeral; vision analysis not connected |
| Image UI verification | Local previews and honest unavailable-analysis labels | 390px empty Photos panel inspected. AGG used the documented browser filechooser: selection and reviewed removal passed on 195101a, thumbnail failed because private CSP omitted blob images. CSP correction and desktop reserved-space layout await the next preview; native app control remains unused |
| Draft updates | Canonical draft proposal/receipt and pure refresh verification | Core commits `4a4d2e4`/`4156d24`; whole-workspace version checks protect manual edits and pending requests. Browser adapter is intermediate; database draft persistence and full UI flow are pending |
| Voice | Existing bounded recorder contract supplied separately | Not integrated into this UI yet. No real STT/TTS, no automatic send and no paid calls |

Preference, memory and image state machines retain uncertain action/upload identifiers instead of blindly repeating writes. Timeouts are 45 seconds; cancellation and identity changes discard late responses. An image selected locally is not an uploaded or analyzed image. A proposal is not an executed action. Durable preferences do not imply durable memory, drafts, attachments or conversations.

Private preview evidence: `1f2df6` shared Food/Workout continuity; `47f48d2` preference/memory review and receipt; `195101a` image selection UI shell. Each preview has protected access and explicit examples. None is a production deployment, real paid-model evaluation or physical iPhone performance result. Desktop visual verification and physical iPhone13/15ProMax measurements remain pending. Route bundle limits are unchanged.

The private adapters reuse the transaction core and the already locked SHA-256 package; no new package version or local installation was introduced. Database experiments are guarded disposable CI SQL, outside the productive migration ledger. Production migrations, public Atlas/coach/redesign activation and unapproved media remain on HOLD.

# GPT-Live integration candidate — 2026-09-12

Base: `1d64ba50c26427e6873249c8697830c36490b75d`, AG1 existing integration worktree.

DS1 and DS2 final AG4-reviewed snapshots were verified by their published SHA256 hashes before import. Relative TypeScript imports were normalized, node:test fixtures were adapted to Vitest, and fake session handles were typed without weakening assertions. The standalone DS1 panel is not imported into application UI; localization and the existing Ask composer remain the application integration responsibility.

Implemented offline:

- Client/server lifecycle modules and regression coverage for cancellation, late session creation, pending SDP disposal, isolation of session events, provider-only usage and bounded cleanup.
- Actual browser audio-element ownership for interruption, playback recovery and disposal. Resume now invokes the output port, including a regression after logout.
- Canonical duration binding in the existing pilot budget schema and transaction. Existing token usage types and historical ledger rows remain supported. No second ledger, cap, actor list or database migration.
- Server adapter rejects a foreign actor/pilot, backend attempts presented as voice, inconsistent reservations and forged prices. Backend work must continue through the existing governed engine.
- Verified $0.05/minute rate: reservation uses an integer per-second ceiling; final usage uses the exact rational minute tariff with one nano-USD upward rounding. The 15-second initialization is a minimum, not an extra charge.
- Known overruns reach the canonical ledger and raise accountingAlert rather than being hidden behind a rejected settlement. Fractional/unsafe duration readings are not rounded down or inferred.

Latest focal evidence: `/private/tmp/live-ledger-tests.json`, `/private/tmp/live-ledger-typecheck.log`, `/private/tmp/live-ledger-lint.log`. Tests use injected doubles; they do not prove a database transaction or a provider session occurred.

Application wiring added, pending integrated review and Preview execution:

- Authenticated create/close/status route with actor and durable-conversation checks; user/session association is stored alongside the canonical agent run.
- Server-only sideband attach and confirmed close, filtering out reflected audio rather than persisting it.
- Next.js after retains event supervision inside maxDuration 180 seconds, with a 120-second admitted session plus cleanup. This is bounded platform work, not an unbounded worker or crash-survival guarantee.
- Browser WebRTC, completed ICE offer, audio playback owner, opt-in controls, microphone shutdown and conversation/unmount disposal.
- Client delegation invokes the existing Ask conversation controller and returns its answer to the voice model. Existing app review/confirmation/writer cards remain authoritative.
- EN/ES/EL control labels; dictation and manual typed flows remain separate and available.

Current focal evidence: 88/88 tests passing, TypeScript passing, lint zero errors (12 warnings including existing hooks/test doubles). New route/UI tests validate closed gates, foreign-origin rejection, scoped lookup, explicit microphone gesture and disposal; they do not certify actual network audio.

Remaining: AG4 wiring review, exact CI/Preview, real provider session under shared reservation, browser/device verification, reviewed Food patches and the release gates before production.

No provider call, paid activation, database operation or production release occurred in this candidate. Existing QA Preview remains at the base commit. AG4 canonical accounting delta review: conditional static PASS, `control/ag4/live02-gpt-live-ledger-integration-review.v1.json`, SHA256 `5f81848eee33ae211b4133ebade813a02a11a5f167c064cecb0b48d518b85258`. This does not cover real route/Auth/DB/provider/browser execution.

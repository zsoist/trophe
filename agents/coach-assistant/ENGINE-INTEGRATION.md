# Complete quarantined candidate engine bundle

AG1 agreed baseline: 28734fb383acab50182bf927cffbe58370aaf347, no WIP in
conversation/index/schema/contracts/handler. Food/voice/pricing CI remains AG1's
priority. This bundle does not activate a product model or approve live spend.

Integration artifact:
/Volumes/SSD/TROPHE_DUAL_AGENTS_R1/control/ag3/engine-bundle/engine-v5.1.patch
SHA256: 2365cc93cf7eaeb7b4561a60e60e7e27e7f685de34b697d858603facaaad3c86
Sibling manifest.json records each base/target SHA256. git apply --check passed
against AG1's agreed files. The patch is the integration unit: it contains the
complete current engine rather than replaying abandoned partial engine commits.
Do not cherry-pick this AG3 turn alone into an AG1 tree missing the engine.

Thirteen files: five engine modules (open-conversation, prompt.v4, prompt.v5,
curated-explanations, conversation-candidate); open/candidate regression tests;
actual pilot-candidate composition and tests; focal contracts/conversation/handler
changes; nullable escalation reason in pilot-runner's existing candidate port.
No UI, route, schema, migrations, dependencies, memory service/broker imports,
legacy memory readers or CI files. The engine subset is independent of the
unintegrated memory slice. Merge the separately reviewed memory turn changes
later, preserving their actual pre-generation history filter.

The real engine collects deterministic records through the existing repository,
filters domain evidence, uses a single structured injected transport and renders
quantified facts as entire canonical evidence statements. It retains candidate
numeric/action/health/presupposition/completion guards, typed evidence/entity
binding, curated general explanation provenance, proportional urgent triage,
context/usage limits and no tool execution. Candidate prose is not reduced to
question codes; explanations and open follow-ups remain free prose. These checks
are conservative regression guards, not a semantic correctness proof.

Prompt version is coach-assistant.conversation.v5-candidate.1. It clarifies current
confirmed versus unconfirmed memory and historical user statements. To support
several turns under the unchanged 7500-byte conservative bound, oldest assistant
history is trimmed before older user turns; current message and calculated facts
are never trimmed. A context too large even without history still fails closed.
Trimming is disclosed in response limitations.

runCoachConversationPilot explicitly supplies the real engine to the existing
runCoachPilotEvaluation candidate port. The cumulative budget runner still owns
reserve/claim/settle, unknown-model pricing holds and replay prevention. Live
remains blocked at cap0. Existing fixture-only runner tests remain separate.

The existing handler can select this real engine only when the server flag
COACH_ASSISTANT_CANDIDATE_EVALUATION_ENABLED=1 AND data source is synthetic AND
candidateEvaluation.kind=injected_fixture with an explicitly injected transport.
The app route does not bind this dependency. No default provider or paid call is
added to HTTP. Missing injection/authorized-records mode fails closed; flag-off
keeps the existing behavior. This is an executable Request/Response test path,
not deployed HTTP/Auth acceptance or a production quality claim.

Validation: copied AG1's module into an isolated file-only verification directory,
applied the exact 13 target files with AG1 shared dependencies, then ran 57 tests
across open engine, candidate guards, three-turn actual engine follow-up/current
record context, real candidate→budget runner, and handler flag behavior. All
passed. The same materialized bundle passed scoped TypeScript; changed AG3 source
also passed scoped TypeScript and lint. No new server/database stack, API call,
package install or CI run was performed. AG4 review and AG1 integration remain
required; no Luna quality or account model availability is established.

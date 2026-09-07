# Open conversation v4 — synthetic transport evaluation

`runConversation(request, { ...options, mode:'model', offlineConversationProvider })`
is the test entrypoint. The callback accepts the existing invokeStructuredProvider
input, including schema/validator, existing coach_assistant policy (Luna low),
maxTokens 2000, maxAttempts 1 and store:false. It returns ProviderResult<unknown>.
No live provider is imported or called. Non-synthetic repositories and absent
injection are budget_blocked. HTTP has no provider injection, so live stays blocked.

The prompt receives the latest text, up to six bounded history entries, authorized
facts, minimal profile and unconfirmed memory context. Subject/organization/source
record IDs are not sent; entities use scoped aliases. History and retrieved text
are explicitly untrusted data. The existing scoped reads and post-generation
authorization remain in force. Medical escalation bypasses generation.

Output: open answer prose, evidenceRefs, entityRefs, typed `facts` fragments
`{kind:'record_fact',evidenceId}`, optional followUp, limitations and escalation.
Prose is labeled interpretation for review. Quantitative facts are rendered from
the full canonical evidence statement. The provider cannot pair a correct value
with another metric, change a unit or author a new numeric statement. The earlier
bag-of-supported-values approach was removed after AGG identified swapped metrics.
This does not return to a finite list of suggestions: prose and follow-up are free
text while factual numerical rendering belongs to deterministic code.

Validation rejects unknown references/entity aliases, numeric prose (including a
bounded common English/Spanish number-word list), malformed fragments, selected
physiological/causal assertion terms and explicit action-completion claims. Lexical
checks are conservative and incomplete: they are not a semantic theorem or a
multilingual safety classifier. Independent qualitative counterexamples remain
required, particularly implied claims without digits, paraphrased causal claims,
unconfirmed memories, instruction injection and health-context follow-ups. Do not
label a valid reference as evidence that every sentence is true.

Limits: one invocation, no repair/fallback; enclosing 45-second deadline; four data
reads; request+system+schema at most 7500 UTF-8 bytes as a conservative token bound
with wire headroom. Bytes are not measured model tokens. Reported fixture usage is
checked at 8000 input and 2000 total output, reasoning included within output;
usage is diagnostic and cost remains zero. Reject oversized context rather than
silently dropping evidence/history. Live evaluation must measure actual usage,
latency and context completeness before relaxing this conservative cap.

Current tests cover a Spanish open follow-up with Food history, canonical facts,
bad reference/entity/number, swapped metrics, action claims, selected physiological
claims, cancellation/deadline/provider error, output budget, post-generation
revocation and real-record budget denial. These are development tests, not held-out
quality results. No paid API evaluation, real-user disclosure or clinical quality
claim has been made. Next API step requires AGG's budget/access decision plus the
previously specified durable budget reservation and measured usage reconciliation.

## Correction after independent QUALITY-01 failures

AG4 found that passive save claims and unsupported physiological improvements were
published as interpretations. The default evaluation now fails closed on free
declarative sentences. It accepts bounded question/suggestion speech acts while
record assertions continue through canonical fact fragments. Model limitations are
restricted to conservative limitation codes rather than another free assertion field.
This is a temporary fallback, not completion of the declarative-conversation mandate.

Full declarative generation remains an explicit offline evaluation path through
`offlineInterpretationReview`. This separately supplied fixture oracle receives a
copy of the candidate, cited IDs and authorized evidence and must approve before
publication. Request JSON and the generator cannot configure it; HTTP never supplies
it. Numeric, entity, medical and action restrictions still run before the oracle.
The review hook is infrastructure for independent evaluation, not a completed
semantic checker: an always-approve fixture proves only the callback mechanics.
Do not enable unrestricted declarative output in product based on those tests.
The independent quality gate, actual Luna evaluation and broader multilingual
counterexamples remain pending. Speech-act lexical bounds also are not universal
protection against every presupposition or paraphrase inside a question/suggestion.

### Current gate supersedes the speech-act fallback above

An additional independent question presupposed stronger muscles and a healthier
heart. Questions/suggestions therefore receive no exemption: every answer and
followUp now requires the separate offline oracle. Its input includes both prose
fields, limitations, evidence references and copied canonical evidence. Without
that gate, generated prose is withheld as invalid_output. The grammar heuristic
was removed. Development happy paths use an explicit fixture-specific oracle;
that is not an implementation of general semantic verification. Full conversation
quality and live enablement remain incomplete; the generator/schema/evaluation
entrypoint are retained for the required independent evaluation.

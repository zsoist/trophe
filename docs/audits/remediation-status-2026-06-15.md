# Trophē — Enterprise Remediation Status (2026-06-15)

Single source of truth for "where are we in the WP remediation." The Enterprise
Remediation Report splits the path-to-100 into 8 work packages (WP0–WP7).
**4 of 8 complete (WP0–WP3) — merged and live on trophe.app.** WP4–WP7 remain and
contain every Tier-0 *binary* blocker that gates a real clinic signature.

Production: trophe.app · Supabase `iwbpzwmidzvpiofnqexd` (us-east-2) · `main` @ `00274ca` · CI green.
Full path-to-100: [`enterprise-readiness-2026-06-13.md`](enterprise-readiness-2026-06-13.md).

## Work-package status

| WP | Scope | Status | Evidence / what's missing |
|---|---|---|---|
| WP0 | Correct unsupported public claims | ✅ **DONE** | claim-evidence register (round-4) + `tests/trust/public-claims.test.ts` CI guard (forbids affirmative form of every non-verified `/trust`+DPA claim); public sub-processor registry |
| WP1 | Identity / invitation / consent integrity | ✅ **DONE** | invite-code coach signup (role from DB), coach→client `/activate?token=` + mandatory Art.9 consent, false email claims removed (PR #22) |
| WP2 | Database truth + tenant isolation | ✅ **DONE** | PR #25 (`7c50c38`): `rls.test.ts` SELECT matrix + write-side `42501`/0-row INSERT/UPDATE denials; `verify.ts` no `TO public` + anon allowlist; TS-schema drift → authenticated; seed foods bootstrap-only (0049 deleted, prod 0 wp2-seed rows) |
| WP3 | Delivery governance + CI truth | ✅ **DONE (live)** | PR #26 (`00274ca`, deploy `5072733064`, health 200): coverage gate runs in required CI; 700-benchmark on-demand only; dead config removed; CODEOWNERS/Dependabot/runbook; governance+invariants guards. **9.2/10** — remaining 0.8 = operator-owned dashboard gates (below) |
| WP4 | Commercial lifecycle (Stripe) | ⬜ **PENDING** | Tier-2: Stripe subscriptions + plan enforcement, multi-coach/clinic admin UI, email invite delivery. *Unlocks revenue.* |
| WP5 | Privacy + procurement | ⬜ **PENDING** | **Tier-0 legal blockers:** executed DPA + DPIA, consent-withdrawal + erasure **fulfilment** (intake-only today), DeepSeek-China Art.46 transfer basis, egress/minimisation tests, rights-request SLA |
| WP6 | Reliability + scale | ⬜ **PENDING** | **Tier-0 ops blocker:** Supabase Pro backups + PITR + restore drill; push alerting + uptime monitoring; Supavisor pooling correctness |
| WP7 | Frontier product evidence | ⬜ **PENDING** | Accuracy/benchmark evidence pack, AI-delivery proof, methodology publication |

## Scorecard (2026-06-15)

| Lens | 2026-06-13 | Now | Why it moved (or didn't) |
|---|---:|---:|---|
| Engineering quality | ~7.7 | **~8.1** | WP0-3 added claims-honesty, tested tenant isolation, and a CI that can't go green on un-run evidence |
| **Real B2B enterprise readiness** | ~4.8 | **~5.2** | WP0-3 hardened security-code + trust + CI, but cleared **zero Tier-0 binary blocker** — a careful clinic still cannot sign |

**Why enterprise readiness only moved +0.4:** the signature is gated by *binary* blockers
— no backups (WP6); no executed DPA, no China-transfer basis, no erasure fulfilment (WP5);
no billing (WP4). Code quality cannot substitute for any of these. Sequence to unlock:
**WP5 + WP6** clear Tier-0 → ~6.5 (legally signable for a careful clinic), then **WP4** → ~8.7
(billable). Tier-3 perf + EU migration + fine-tuned accuracy → ~9.5 (world-class B2B). 10/10 is
asymptotic (SOC 2 Type II, pen test, measured 99.9% SLA, multi-region DR) — a revenue-scale goal.

## Operator-owned (WP3 tail — settings, not code)
Cannot be set from the repo; the release owner verifies these in GitHub/Vercel before WP3 is
"truly complete": branch-protection ruleset on `main` (required PR + checks `verify`/`Vercel` +
review, conversation resolution, block force-push/deletion) · Dependabot security updates ·
allowed-Actions allowlist (incl. `gitleaks/gitleaks-action`) · Vercel preview protection ·
public-repo posture. Runbook + exact commands: [`../ops/wp3-delivery-truth.md`](../ops/wp3-delivery-truth.md).

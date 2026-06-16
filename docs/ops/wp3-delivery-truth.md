# WP3 Delivery Truth Gates

WP3 exists to make a green build mean the release evidence actually ran. This
file separates controls that are enforceable in the repository from controls
that must be set in GitHub/Vercel by the operator.

## Repository-Enforced Gates

- Required CI pins third-party GitHub Actions to full commit SHAs.
- Required CI cannot use `ALLOW_SKIPPED_EVALS`.
- Required CI sets `EVAL_REQUIRED_SUITES=recipe_analyze,coach_insight`; those
  branch-runnable AI suites fail loud if skipped.
- The production nutrition benchmark in `nightly-eval.yml` is **on-demand only**
  (`workflow_dispatch`, no schedule): it calls the live authenticated production API
  over the full ~700-case food corpus (one DeepSeek call per food-parse), so it is NOT
  run nightly — that would burn ~700 LLM calls/day for no per-release signal. Trigger it
  manually before a release that touches nutrition accuracy; its secrets (`EVAL_AUTH_*`,
  Supabase) must be present for it to count as green evidence.
- Food readiness in CI checks the deterministic local bootstrap fixture against its
  measured floor: at least 14 rows, ≥95% authoritative metadata, and at most 87 non-fixture
  rows missing embeddings. Production embedding coverage remains a separate prod-data gate
  (the on-demand benchmark above).
- Coverage thresholds are configured in `vitest.config.ts` and **enforced in required CI**:
  the unit/integration step runs `npm run test:coverage`. The thresholds are low initially
  to prevent fake confidence while making coverage regression a hard, executed gate.
- CODEOWNERS names high-risk production-change surfaces: workflows, migrations,
  schema, auth, privacy, cron/internal endpoints, AI agents, ops scripts, and
  trust documentation.

## Operator-Owned Gates

These cannot be made reliable by committing files alone. The release owner must
verify them in GitHub/Vercel settings before claiming WP3 complete:

- protected main branch or ruleset is enabled.
- required pull request before merging to `main`.
- required checks include GitHub `verify` and Vercel preview/deployment checks.
- one approving review is required for material production changes.
- conversation resolution is required before merge.
- block force pushes on `main`.
- block branch deletion for protected branches.
- Dependabot security updates are enabled in repository security settings.
- allowed Actions is restricted to GitHub-owned Actions plus approved vendors
  used by this repo (`gitleaks/gitleaks-action`).
- Vercel preview protection is enabled, with scoped automation bypass only where
  documented.
- public repository posture is intentional and reflected in README/license/legal
  documents.

## Release Evidence Standard

A release is not "verified" because CI is green. It is verified when the specific
evidence named by the package has run and is reviewable:

- auth/security package: authenticated E2E or documented live canary evidence.
- tenant/RLS package: fresh bootstrap plus cross-tenant matrix.
- privacy package: rights-request simulation and artifact review.
- AI package: required evals plus provider smoke where applicable.
- deployment-governance package: this file plus passing
  `tests/enterprise/delivery-governance.test.ts`.

# WP3 Delivery Truth Gates

WP3 exists to make a green build mean the release evidence actually ran. This
file separates controls that are enforceable in the repository from controls
that must be set in GitHub/Vercel by the operator.

## Repository-Enforced Gates

- Required CI pins third-party GitHub Actions to full commit SHAs.
- Required CI cannot use `ALLOW_SKIPPED_EVALS`.
- Required CI sets `EVAL_REQUIRED_SUITES=recipe_analyze,coach_insight`; those
  branch-runnable AI suites fail loud if skipped.
- The production nutrition benchmark remains in `nightly-eval.yml` because it
  calls the live authenticated production API and the full production food
  corpus. Its secrets must be present before it is treated as green evidence.
- Food readiness in CI checks the deterministic local bootstrap fixture
  explicitly: 14 rows, 100% authoritative metadata, and zero missing embeddings
  outside bootstrap fixtures.
- Coverage thresholds are configured in `vitest.config.ts`; the threshold is low
  initially to prevent fake confidence while still making coverage regression a
  visible gate when `npm run test:coverage` is executed.
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

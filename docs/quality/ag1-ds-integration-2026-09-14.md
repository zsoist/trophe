# AG1 DeepSeek worker integration — 2026-09-14

Base: `2e20ae814d369f6525b95400073a97357801f21a`, branch
`codex/ag1-live01-integration`.

This record closes the bounded integration review for the four existing DeepSeek
worker deliveries. It records whether each archived candidate can be applied to
the current AG1 line; it does not switch the product provider, reset the shared
ledger, or authorize production.

## Integration decisions

- **DS1 — Ask editorial finish** (`DS1-ask-editorial-final`, manifest SHA256
  `0d0546db88bb6dbb6df6ed69c0440433704279ed0821344a2888e5d54f04cfe4`): the
  relevant receipt and waiting-mark behavior is already in the current line via
  `027a14b4`; later AG1 fixes preserve composer resizing, canonical Food context,
  and localized error copy. Applying the archived files would remove those
  newer fixes, so the archive remains evidence only.
- **DS2 — Production isolation closure** (`DS2-production-isolation-final`,
  manifest SHA256 `669287f2112133644a373068fcb6d591a36aad7f418442ccb9194c916572a317`):
  the production guard and fixture isolation are already present. The current
  line additionally carries the reviewed preview-only additive cohort from
  `f29ce4e6`; applying the archive would remove that QA-safe behavior. No
  production flag, database, migration, or secret was changed here.
- **DS3 — Advice exact coverage** (`DS3-advice-exact-final`, manifest SHA256
  `890940b83c790c8f6bf773b08720482c689bdf0f321ddbcef2d42f51b4135f98`): strict
  Food identity, one-to-one coverage, one-gram portion tolerance, diet-name
  checks, and honest failure copy are already present. The current line also
  includes the AG1-owned per-turn deadline (`timeoutMs`) added after the worker
  snapshot; applying the archive would regress cancellation and deadline
  behavior. Live handler wiring remains AG1-owned.
- **DS4 — Live finalization closure** (`DS4-live-complete-bounded-closure`,
  manifest SHA256 `297c8611474776f8bdede0a1f205911ba7f0fe48104d64e9e8c11f5eea1be77b`):
  the delivered `server-session` module and its lifecycle/finalize holdouts
  match the current line byte-for-byte, so no second copy was applied.

The DeepSeek workers remain bounded evidence and patch inputs. Luna remains the
configured product fallback/reserve. No worker result authorizes a production
rollout.

## Verification and preview

- Pull-request CI run [34760409444](https://github.com/zsoist/trophe/actions/runs/34760409444)
  passed for the base SHA, including typecheck, lint, unit/integration, E2E, and
  production build.
- A separate `workflow_dispatch` run (`34859535969`) stopped at gitleaks before
  tests because full-history scanning surfaced twelve pre-existing historical
  findings. The findings point to commits before this base and no worker patch;
  no bypass or blind retry was used.
- The preview build from this line completed remotely with Vercel `READY`. A
  branch-associated preview is the required QA target because branch-scoped
  environment configuration must remain attached to the deployment.

## Production boundary

Production remains unchanged and blocked by the existing readiness gates:
provider-approved TLS boundary, atomic migration rehearsal, private attachment
bucket/signing key, real production profile and membership, fresh financial
snapshot, and physical-device canary evidence.

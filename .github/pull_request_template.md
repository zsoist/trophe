<!-- Keep it short. The CI 'verify' job is the hard gate. -->

## What & why


## How verified
- [ ] `tsc`, `lint`, `build` green locally
- [ ] tests added/updated for the change
- [ ] if a `drizzle/*.sql` migration was added → matching entry in `drizzle/meta/_journal.json` (CI guards this)
- [ ] no auth/RLS change without explicit go (production-critical)
- [ ] release evidence named for this package actually ran; no skipped required evals/tests
- [ ] if CI/previews/nightlies are not sufficient evidence, operator/manual canary is named below
- [ ] if touching workflows, migrations, auth, privacy, cron/internal endpoints, AI, or trust docs → CODEOWNERS path is covered

## Risk & rollback


## Screenshots / notes (UI changes)

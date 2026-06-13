<!-- Keep it short. The CI 'verify' job is the hard gate. -->

## What & why


## How verified
- [ ] `tsc`, `lint`, `build` green locally
- [ ] tests added/updated for the change
- [ ] if a `drizzle/*.sql` migration was added → matching entry in `drizzle/meta/_journal.json` (CI guards this)
- [ ] no auth/RLS change without explicit go (production-critical)

## Risk & rollback


## Screenshots / notes (UI changes)

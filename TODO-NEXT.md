# TODO-NEXT — Working tree status as of 2026-05-02

All items below are in the working tree but NOT yet committed.
Read this at the start of the next session before touching anything.

---

## CI state (run 25251115031 on commit 847106a)

| Step | Status |
|---|---|
| Guard (fixture self-test) | ✅ |
| Guard (real source scan) | ✅ |
| Bootstrap | ✅ |
| Verify DB | ✅ |
| Explain plans | ✅ |
| Typecheck | ✅ |
| Lint | ✅ |
| Unit + integration tests | ✅ |
| Enterprise readiness | ✅ |
| Agent eval smoke | ✅ |
| Playwright install | ✅ |
| E2E smoke tests | ✅ (8 passed, 14.4s) |
| Production build | ✅ |

**First fully green CI run on `v0.3-overhaul`.**

---

## BLOCKED on Phase 4 (trophe_user creation)

These files must NOT be committed until `trophe_user` is created on
`open_brain_postgres` and `.env.local` is updated to use it.

| File | Change | Blocker |
|---|---|---|
| `scripts/ingest/usda.ts:154` | Remove `brain_user:jDehquqo1...@5433` literal | Rotate first |
| `scripts/ingest/hhf-dishes.ts:341` | Same | Rotate first |
| `scripts/ingest/embed-foods.ts:113` | Same | Rotate first |
| `scripts/db/migrate-production.sh:52,56` | Same | Rotate first |

**Phase 4 steps (self-contained):**

```bash
# 1. Create trophe_user on Mac Mini open_brain_postgres
NEW_PASS=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | cut -c1-32)
echo "TROPHE_DB_PASS=$NEW_PASS" >> ~/.local/secrets/trophe.env

psql -h 127.0.0.1 -p 5433 -U postgres -d postgres \
  -c "CREATE ROLE trophe_user WITH LOGIN PASSWORD '$NEW_PASS';" \
  -c "GRANT CONNECT ON DATABASE trophe_dev TO trophe_user;"
psql -h 127.0.0.1 -p 5433 -U postgres -d trophe_dev \
  -c "GRANT USAGE ON SCHEMA public TO trophe_user;" \
  -c "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO trophe_user;" \
  -c "GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO trophe_user;"

# 2. Update .env.local
# DATABASE_URL=postgresql://trophe_user:<new-pass>@127.0.0.1:5433/trophe_dev
# PGPASSWORD=<new-pass>

# 3. Verify Trophee still works
psql "$DATABASE_URL" -c "SELECT 1;"
npm test

# 4. Verify brain_user (OpenBrain) is untouched
psql -h 127.0.0.1 -p 5433 -U brain_user -d open_brain -c "SELECT 1;"

# 5. Edit source files: replace literal in each with DATABASE_URL env-fail
#    TS: const dbUrl = process.env.DATABASE_URL;
#        if (!dbUrl) throw new Error('DATABASE_URL required. See .env.local.example.');
#        const pool = new Pool({ connectionString: dbUrl, max: 5 });
#    SH: LOCAL_DB="${DATABASE_URL:?Set DATABASE_URL — see .env.local.example}"

# 6. Commit: "security: migrate Trophee from shared brain_user to trophe_user"
```

---

## EVAL-GATED — meal_suggest model upgrade (deadline: 2026-05-09)

The `meal_suggest` policy is currently `google/gemini-2.0-flash` (documenting
what HEAD's route already used). The proposed upgrade to `gemini-2.5-flash`
requires a 15-prompt eval comparing both models on meal suggestion quality.

**Action**: Build the eval, run it, commit the `policies.ts` change if quality
parity is confirmed. If not built by **2026-05-09**, accept `gemini-2.0-flash`
permanently and delete this entry.

| File | Change |
|---|---|
| `agents/router/policies.ts` | `meal_suggest.model`: `gemini-2.0-flash` -> `gemini-2.5-flash` |
| `agents/router/pricing.ts` | Update pricing entry from 2.0-flash to 2.5-flash rates |

---

## READY — commit in dependency order

### Commit E: schema operator-class sync (no DB change needed)
| File | Change |
|---|---|
| `db/schema/food.ts` | `userId` index: `date_ops` -> `uuid_ops` (sync with 0000.sql) |
| `db/schema/measurements.ts` | Same |
| `db/schema/supplements.ts` | Same |
| `db/schema/water_log.ts` | Same |
| `db/schema/workouts.ts` | Same |

Safe: `0000_complex_johnny_blaze.sql` already has `uuid_ops`. This is a
TypeScript-only sync, no migration needed.

### Commit F: docs (last)
| File | Change |
|---|---|
| `CODEX.md` | Updated |
| `DEPLOYMENT.md` | Updated |
| `README.md` | Updated |
| `RUNBOOK.md` | Updated |

---

## brain_user architectural note

`brain_user` is OpenBrain's system account, shared across 7+ Mac Mini services.
Trophe's ingest scripts used it as a convenience. The plan:

- Create `trophe_user` on `open_brain_postgres` with least-privilege grants on `trophe_dev`
- Update Trophe's `DATABASE_URL` to use `trophe_user`
- Remove literal password from 4 source files (Phase 4 commits above)
- Leave `brain_user` and OpenBrain untouched
- Separate audit: `forge-discord-bot` and other repos also hardcode `brain_user` — separate task

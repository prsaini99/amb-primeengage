# Supabase artifacts

This directory holds **new** SQL migrations and the admin seed.

## Rules

1. **Never** re-issue `CREATE TABLE` for objects that already exist on the live
   project (`amb_profiles`, the `amb_applications` storage bucket). Their
   schema is the source of truth — see `docs/database-schema.md` for the
   introspected snapshot.
2. New tables (`amb_activities`, `amb_submissions`, `amb_points_ledger`, etc.)
   ship as numbered migrations under `migrations/`.
3. Schema changes are applied via the Supabase Management API
   (`POST /v1/projects/<ref>/database/query`). Mirror every applied change
   into a migration file so the change is reproducible.
4. Edge Functions are **deferred** for Phase 1 — approve/reject run as Next.js
   Route Handlers per the SMTP decision (see `docs/migration-tasks.md`).

## Layout

```
supabase/
├── README.md             ← this file
├── functions/            ← Edge Functions (Phase 2 onward; not in Phase 1)
└── migrations/           ← numbered SQL migrations for *new* objects
```

The admin seed is **not** in this folder — it runs through the Auth Admin
API via `scripts/seed-admin.mjs` (`npm run seed:admin`) rather than through
SQL. See `docs/admin-seed.md`.

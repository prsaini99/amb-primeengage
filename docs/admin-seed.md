# Admin Seed — One-Shot Script

Seeds the platform's single admin account. Runs entirely against the
Supabase Auth Admin API + service-role client — **no Dashboard access
needed**.

## Prerequisites

- `.env.local` populated. The script requires:
  - `SUPABASE_URL`
  - `SUPABASE_SECRET_KEY` (service role)
- `npm install` has been run.
- The `amb_profiles` table exists on the live project (verify with
  `npm run supabase:introspect`).

## Run

```bash
npm run seed:admin
```

That's it. The script will print a credentials block on success — **save it
immediately**. The generated password lives nowhere else.

## What it does (in order)

1. Loads `SUPABASE_URL` + `SUPABASE_SECRET_KEY` from `.env.local`.
2. Pre-flight check — aborts (exit 1) if `test1@stackbinary.io` already
   exists in either `auth.users` OR `amb_profiles`. Never produces dupes.
3. Generates a 16-char base64url password (96 bits of entropy).
4. `supabase.auth.admin.createUser({ email, password, email_confirm: true,
   app_metadata: { role: 'admin' } })`.
   - `email_confirm: true` skips email-verification roundtrip.
   - `app_metadata.role = 'admin'` is what `proxy.ts` reads from the JWT —
     no DB hit per request.
5. Inserts the matching `amb_profiles` row (`role='admin'`,
   `status='approved'`, `auth_user_id=<new uid>`, `approved_at=NOW()`).
   Phone / college / city use placeholder values; admin doesn't fill those
   fields.
6. If the profile insert fails, the script rolls back the auth user so the
   two sides stay in sync and you can re-run cleanly.
7. Prints the credentials block:

   ```
   =================================================
     ADMIN CREDENTIALS — SAVE NOW (one-time output)
   =================================================
     Email:           test1@stackbinary.io
     Password:        <generated>
     Auth user UUID:  <auth.users.id>
     amb_profiles.id: <profile.id>
   =================================================
   ```

## Re-seeding (fresh environments / wiped state)

The script is idempotent — running it twice on a non-empty state aborts
without changes. To re-seed (e.g. after wiping a dev DB):

```sql
-- delete the profile first (FK cascade is ON DELETE SET NULL on auth_user_id)
DELETE FROM public.amb_profiles WHERE email = 'test1@stackbinary.io';
```

Then via JS (or Management API), delete the auth user:

```ts
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const { data } = await sb.auth.admin.listUsers({ perPage: 200 });
const u = data.users.find((u) => u.email === "test1@stackbinary.io");
if (u) await sb.auth.admin.deleteUser(u.id);
```

Then re-run `npm run seed:admin`.

## Lifecycle

- The script may be deleted after seeding all envs you need; it is also safe
  to keep around (idempotent, refuses to clobber).
- Future admins (Phase 4 — multi-admin) will be created through an in-app
  flow that uses the same `app_metadata.role` mechanism.

## Why no Dashboard step

The previous version of this doc walked through Dashboard → Authentication →
Users → "Add user". That assumed Dashboard access. We don't have it for
this account, so the entire flow runs through the Auth Admin API instead.
Cleaner, scriptable, reproducible.

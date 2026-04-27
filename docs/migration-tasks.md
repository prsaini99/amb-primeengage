# Phase 1 → Phase 2 Migration Tasks

A running log of deliberate Phase 1 deviations from
`ambassador_platform_tech_doc.md` that we will reverse in Phase 2.

Every entry has the same shape: **decision**, **why we deviated**, **what
needs to change**, **trigger / when to act**.

---

## 1. Email: SMTP / nodemailer → Resend + Edge Function

**Phase 1 decision (Q3 of kickoff):** send transactional emails (approval,
rejection) from Next.js Route Handlers using `nodemailer` over SMTP, mirroring
`primeengage/lib/mailer.ts` exactly.

**Why we deviated**

- Resend account / domain not yet provisioned — would block Phase 1 cleanly.
- The SMTP creds for `hello@primeengage.in` are already working and tested in
  the `primeengage` repo, so reusing them carries near-zero integration risk.

**What needs to change in Phase 2**

1. Provision Resend, verify the `primeengage.in` domain.
2. Create `supabase/functions/send-email` (Deno) that wraps the Resend SDK.
3. Move `sendApprovalEmail` / `sendRejectionEmail` content (templates, helpers
   `baseHtml`, `kv`) out of `lib/mailer/*.ts` into the Edge Function.
4. Replace the Route Handlers `/api/admin/applications/[id]/approve` and
   `.../reject` with Edge Functions `approve-application` and
   `reject-application`. The frontend then calls the Edge Function URL with
   the user's session JWT; service-role key stays inside Supabase secrets,
   not Vercel env.
5. Remove `nodemailer` and the SMTP_* env vars from this repo.
6. Update §6.1 / §8 of the tech doc to drop the "Phase 1 deviation" footnote.

**Trigger to act**

- Resend account exists AND `primeengage.in` domain is verified, OR
- We need to send mail from a context that doesn't have Vercel env (e.g.,
  scheduled jobs, webhooks from third parties), OR
- Compliance / audit asks why service-role keys are in Vercel.

---

## 2. Service-role key location: Vercel env → Supabase secrets

**Phase 1 decision:** `SUPABASE_SECRET_KEY` lives in Vercel environment
variables, accessed via `lib/supabase/admin.ts` from Route Handlers and
Server Actions.

**Why we deviated**

- Direct consequence of #1 — once email is in a Route Handler, the
  service-role-bearing path lives in Vercel anyway.
- Single deployment surface (Vercel) is simpler for Phase 1.

**What needs to change in Phase 2**

- Eliminated automatically when #1 is done. Edge Functions read service-role
  from Supabase's own secret store, never from Vercel.

**Trigger to act**

- Same as #1.

---

## 3. RLS policies on `amb_*` tables — currently 0 across the board

**Current live state:** RLS is enabled on every `amb_*` table but **no
policies exist**, so the tables are unreadable by `anon` and `authenticated`
roles. All reads + writes go through `lib/supabase/admin.ts` (service role).

**Phase 1 / Phase 2 decision (consistent across both sides):** the admin UI
**and** the ambassador dashboard use service-role access through typed gates
(`requireAdmin()` / `requireAmbassador()`). Acceptable because:

- Identity is verified by the proxy + the `require*()` helper before any
  query runs (JWT app_metadata.role + a `amb_profiles` lookup).
- All point-affecting + auth-affecting writes go through Route Handlers
  (`/api/admin/*`, `/api/dashboard/*`) that re-gate themselves.
- Every cross-user query is scoped by `profileId` from the gate result —
  no client-supplied user identifiers reach a `WHERE user_id = X` clause.

**What changes in Phase 3 (defense-in-depth polish)**

Add the policies anyway as belt-and-suspenders, so a buggy route handler
that forgets to scope by `profileId` can't leak rows. The policies (rough
shape):

```sql
-- ambassadors: own profile, own submissions, own files, own ledger entries
create policy amb_profiles_self_select   on public.amb_profiles        for select to authenticated using (auth.uid() = auth_user_id);
create policy amb_profiles_self_update   on public.amb_profiles        for update to authenticated using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
create policy amb_activities_active_read on public.amb_activities      for select to authenticated using (is_active);
create policy amb_subs_self_select       on public.amb_submissions     for select to authenticated using (user_id in (select id from public.amb_profiles where auth_user_id = auth.uid()));
create policy amb_subfiles_self_select   on public.amb_submission_files for select to authenticated using (submission_id in (select id from public.amb_submissions where user_id in (select id from public.amb_profiles where auth_user_id = auth.uid())));
create policy amb_ledger_self_select     on public.amb_points_ledger    for select to authenticated using (user_id in (select id from public.amb_profiles where auth_user_id = auth.uid()));
```

The leaderboard view (`amb_v_leaderboard`) intentionally needs cross-user
data — it stays service-role-only and is fetched on the server side.

**Trigger to act**

- Phase 3 polish, or sooner if any route handler is found to forget its
  `profileId` scoping during code review.

---

## 4. Bucket-level enforcement on `amb_applications`

**Current live state:** bucket exists, private, but `file_size_limit` and
`allowed_mime_types` are NULL — caps are enforced client-side only by
`primeengage`'s upload code per `lib/ambassador/types.ts`.

**Phase 1 decision:** acceptable. Defense-in-depth bucket-level enforcement
deferred.

**What needs to change**

```sql
UPDATE storage.buckets
SET file_size_limit  = 5 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
WHERE name = 'amb_applications';
```

**Trigger to act**

- Before the form is opened to public traffic at scale, or sooner if we see
  oversized uploads in storage logs.

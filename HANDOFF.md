# Ambassador Platform — Handoff Notes

You are starting work on the **ambassador platform repo** (the *second* repo).
Some pieces of this product already exist in the **first repo**
(`primeengage`, the public marketing site). This file is the short companion
to [`ambassador_platform_tech_doc.md`](./ambassador_platform_tech_doc.md) — it
tells you what already exists, what's left to build, and the rules to follow
so the two repos stay in sync.

> Read this **before** the tech doc. It will tell you which parts of the doc
> are already implemented and which are still ahead.

---

## State of the world

### Already built (in the `primeengage` repo, NOT this one)
- Public landing page at `/ambassador-club` describing the program.
- Public application form at `/ambassador-club/apply` that:
  - Validates 14 fields with Zod (see `lib/ambassador/types.ts`).
  - Uploads the Student ID file to the `amb_applications` private storage
    bucket.
  - Inserts a row into `amb_profiles` with `status='pending'`,
    `auth_user_id=NULL`, `application_data` populated.
  - Sends two emails: applicant confirmation + team notification.
- Schema applied to the **live Supabase project**. Already exist:
  - Table `public.amb_profiles` (15 columns)
  - Storage bucket `amb_applications` (private)
  - View `public.admin_overview` (extended with ambassador counts)

### Not yet built (this is **your** repo's job)
Everything in §6 of the tech doc — admin dashboard, ambassador dashboard,
approval flow, activities, submissions, points ledger, chat, events, gallery,
rewards store, payments. None of it exists.

---

## The contract between the two repos

The DB is the contract. Both repos talk to the **same Supabase project**
through the same prefixed table names (`amb_*`).

- **`lib/ambassador/types.ts`** is copy-pasted **verbatim** from the
  `primeengage` repo. It defines the Zod schema and option string arrays
  (`FEST_INVOLVEMENT`, `GO_TO_ACTIVITY`, `ACTIVE_PLATFORM`, `FOLLOWER_RANGE`)
  used inside `amb_profiles.application_data` jsonb.
- When you display or filter applications, **import these arrays** — never
  paraphrase the option labels and never hardcode them locally.
- If the form changes (new field, new option), the change happens in
  `primeengage` first, then `lib/ambassador/types.ts` is re-copied here. The
  two files must stay byte-identical.

---

## Critical rules — do not break these

1. **Schema is already live.** Do **not** `CREATE TABLE amb_profiles` again.
   Confirm what exists by querying `information_schema` or the Supabase
   Management API. Only write migrations for *new* tables (`amb_activities`,
   `amb_submissions`, `amb_points_ledger`, etc.).
2. **`amb_` prefix is mandatory** on every module table, view, and storage
   bucket. No exceptions.
3. **`amb_profiles.id` is owned by us; `auth_user_id` is the FK to
   `auth.users(id)`** (nullable until approval). On approval, create the auth
   user via `supabase.auth.admin.createUser(...)` and
   `UPDATE amb_profiles SET auth_user_id = <new uid>, status='approved', approved_at = NOW() WHERE id = $1`.
   The profile `id` stays stable for life so future FKs
   (`amb_submissions.user_id`, etc.) point to it.
4. **All point-affecting writes go through Edge Functions with the service
   role**, never direct client inserts. RLS protects everything else.
5. **`SUPABASE_SECRET_KEY` (service role) never touches the client.** Edge
   Functions and server components only.
6. **Admin and ambassador UI must visually match the `primeengage` marketing
   site.** The two platforms share one design language. Copy these from the
   primeengage repo into this repo verbatim and treat them as the design
   foundation:
   - `app/globals.css` (Tailwind v4 `@theme` tokens — paper, paper-2,
     navy-900, cyan-500, amber-500, brand-gradient, text-amber-gradient,
     etc.)
   - `components/ui.tsx` (Container, Section, Pill, Button, FeatureCard,
     SectionHeader, Stat)
   - `lib/utils.ts` (the `cn()` helper)
   - Font setup: Plus Jakarta Sans (sans / body) + JetBrains Mono (mono),
     loaded via `next/font/google` and exposed as the `--font-plus-jakarta`
     and `--font-jetbrains-mono` CSS variables.

   For admin-heavy primitives (data tables, sheets, dropdown menus, dialogs,
   command palette), use shadcn/ui — but configure its CSS variables to the
   primeengage palette (navy / cyan / amber on paper / paper-2) so it
   visually matches. **Hybrid by design**: layout and brand surfaces use the
   primeengage primitives; data-heavy admin patterns use themed shadcn.

---

## Phase 1 starting point

The tech doc §12 lays out four phases. We are doing Phase 1 first. The
inherited applicant flow already covers Phase 1 item #2's *applicant side*, so
your minimum vertical slice to close the loop is:

1. **Seed an admin** — insert one auth user (Supabase dashboard or SQL) AND
   one row in `amb_profiles` with `role='admin'`, `auth_user_id` linked. Tech
   doc §13 #5 calls this out.
2. **Auth + middleware + login page** — Supabase Auth, role-based redirects
   (`/admin/*` for admins, `/dashboard/*` for ambassadors).
3. **Admin "Applications" screen** — list `amb_profiles` rows where
   `status='pending' AND role='ambassador'`, show the application_data details
   plus a signed URL preview of the Student ID Card.
4. **Approve / Reject Edge Function** (`approve-application`) — creates the
   auth user, links it, sets `status`, sends the credentials email via Resend.

Once that is end-to-end, move on to activities, submissions, points ledger,
then dashboards, then chat, store, etc.

---

## Useful Supabase facts

- **Supabase Management API** can run arbitrary SQL via
  `POST https://api.supabase.com/v1/projects/<ref>/database/query` with a
  Personal Access Token. Use this for schema introspection during dev.
- Same `.env` keys as the `primeengage` repo: `SUPABASE_URL`,
  `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`. Plus, for this repo,
  you will add `RESEND_API_KEY` (tech doc §2/§8).
- Bucket `amb_applications` is **private**. The admin UI reads files via
  service-role-generated signed URLs — never expose the bucket publicly.
- The form-submitter sees `student_id_url` in `amb_profiles` as a *storage
  path* (e.g. `2026-04/<profile_id>/<uuid>.jpg`), not a public URL. Generate
  signed URLs server-side when the admin needs to view a file.

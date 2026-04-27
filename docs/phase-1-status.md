# Ambassador Platform — Phase 1 Status

**Repo:** `amb-primeengage` · **Companion repo:** `primeengage` (marketing site) · **Date:** 2026-04-25

We started this repo from an empty folder + 3 reference files (HANDOFF.md, tech
doc, shared Zod types). Below is what now exists, what works end-to-end, and
the engineering decisions worth knowing about.

---

## 1. What works end-to-end (Phase 1 vertical slice)

The minimum slice that closes the onboarding loop is **live and exercised in
the browser against the real Supabase project**:

- **Admin sign-in** at `/login` — Supabase Auth, role-based redirect after sign-in.
- **Applications review screen** at `/admin/applications` — lists real
  applicants from `amb_profiles`, filterable by status (Pending / Approved /
  Rejected / All) with live counts.
- **Application detail page** at `/admin/applications/[id]` — shows the full
  survey (why-join, stand-out, fest involvement, follower range, etc.) plus a
  **signed-URL preview of the Student ID Card** (10-min TTL, image inline or
  PDF link based on MIME).
- **Approve flow** — creates the auth user via Supabase Auth Admin API, links
  it to the profile, flips status, **emails credentials over SMTP** with a
  branded HTML template. Two-stage rollback if anything fails (auth user
  cleaned up, profile reset to pending — no orphan state).
- **Reject flow** — flips status, sets `rejected_at`, sends a polite
  rejection email.
- **Sign-out** from the admin sidebar.
- **Route protection** — unauthenticated users hitting `/admin/*` or
  `/dashboard/*` get redirected to login; non-admins hitting `/admin/*` get
  bounced to `/dashboard`. Role check is **cookie-only** (JWT
  `app_metadata.role`) — zero DB hits per request.

End-to-end test: a real applicant submitted via the marketing site is now
clickable in the admin, gets approved with one click, receives credentials
email, and can sign in to their (placeholder) dashboard. **The loop is
closed.**

---

## 2. Tech stack

Matched **exactly** to the marketing site (`primeengage`) so the two repos
share one toolchain — no version-drift bugs:

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.2.4** (Turbopack, App Router, RSC, Server Actions) |
| UI runtime | **React 19.2.4** |
| Language | **TypeScript 5** (strict mode) |
| Styling | **Tailwind CSS v4** (CSS-first `@theme` tokens, no JS config) |
| Auth | **Supabase Auth** (email + password) via `@supabase/ssr 0.10.2` |
| DB | **Supabase Postgres** (shared with `primeengage`; project ref `zpciertrkqwzuuektzpj`) |
| Storage | **Supabase Storage** (private `amb_applications` bucket) |
| Email | **nodemailer + Gmail SMTP** (Phase 1 — Resend planned for Phase 2) |
| Validation | **Zod 4** |
| Icons | **lucide-react** |

---

## 3. Database — what we did

- **Did not re-issue any `CREATE TABLE`** for the live `amb_profiles` table or
  `amb_applications` storage bucket. Verified live state via the Supabase
  Management API instead.
- **Built two scripts** for ongoing schema work:
  - `npm run supabase:introspect` — queries the live schema (tables,
    columns, indexes, FKs via `pg_constraint`, policies, storage buckets) and
    writes a human-readable snapshot to `docs/database-schema.md` with an
    auto-generated **Findings & Gaps** section.
  - `npm run supabase:types` — generates a typed `database.types.ts` from
    the snapshot so every Supabase query is fully type-safe.
- **Applied one new schema change**: `ALTER TABLE amb_profiles ADD COLUMN
  rejected_at timestamptz` (needed by the reject flow). Applied via
  Management API, **mirrored back into primeengage's `schema.sql`** so the
  file-based source of truth stays in sync, recorded as
  `supabase/migrations/0001_amb_profiles_rejected_at.sql`, and added to
  the tech doc §4.1 table.

---

## 4. Brand & design system

The admin UI **visually matches the marketing site** — same fonts, same
palette, same primitives. We copied verbatim from `primeengage`:

- `app/globals.css` — full `@theme` token block (paper, paper-2, navy-900..500,
  cyan-500..50, amber-500..300, mute, line, brand-gradient,
  text-amber-gradient, halo-cyan, shadow-soft, shadow-brand, etc.)
- `components/ui.tsx` — `Container, Section, Pill, Button, FeatureCard,
  SectionHeader, Stat`
- `components/admin/table.tsx` — `PageHeading, StatCard, Badge, TableShell,
  Th, Td, FilterBar, FilterChip, SearchInput, fmtDate, inr`
- `components/logo.tsx` + the actual logo PNG
- Fonts: **Plus Jakarta Sans** (body) + **JetBrains Mono** via `next/font/google`

When admin-heavy patterns need it (data tables with sorting, side drawers,
command palette), we'll add shadcn/ui primitives **themed to brand tokens** —
JIT, only when actually needed. None added yet.

---

## 5. Architecture decisions worth flagging

A few non-obvious calls that shape the platform:

1. **`amb_profiles.id` is the stable PK; `auth_user_id` is the FK.** A pending
   applicant has `auth_user_id = NULL`; on approval we create the auth user
   and stitch it in. Future tables (`amb_submissions.user_id`,
   `amb_points_ledger.user_id`, etc.) point at `amb_profiles.id`, not
   `auth.users.id`. Decouples our domain model from Supabase Auth's lifecycle.
2. **Role lives in the JWT, not in the database.** `app_metadata.role` is
   stamped on the auth user at creation (admin seed / approve flow). The
   route-protection middleware reads it from the cookie-borne JWT — **zero DB
   roundtrips per request**. Massive RPS improvement at scale.
3. **Three Supabase clients with strict separation:**
   - `lib/supabase/client.ts` — browser, publishable key, RLS-bounded.
   - `lib/supabase/server.ts` — server components / route handlers, cookie
     session, RLS-bounded.
   - `lib/supabase/admin.ts` — service-role, **bypasses RLS**, marked
     `import "server-only"` (will throw at build time if accidentally
     imported into a client component).
4. **All point-affecting + auth-affecting writes go through Route Handlers,
   never direct from the client.** Currently: approve / reject. When
   submissions / points ledger / orders ship, same pattern.
5. **Two-stage rollback on the approve route.** If creating the auth user
   succeeds but the profile update fails → delete the auth user. If both
   succeed but the email fails → delete the auth user **and** reset the
   profile to pending. The plaintext password lives in memory only, never
   written to DB or logs. No orphan state, ever.

---

## 6. Engineering discipline — the catches that show care

These are the moments where I pushed back, verified, or caught something
before it became a problem. Worth highlighting because they prevented
class-of-bug-later issues:

1. **Caught wrong-font instruction.** Senior context said "Cabinet Grotesk +
   Inter (body)" — verified against primeengage's actual `app/layout.tsx` and
   `globals.css`, found it was **Plus Jakarta Sans** (Cabinet Grotesk only
   appears inside email HTML font-family fallback chains). Pushed back before
   silently using the wrong font.
2. **Caught Next.js stack drift.** Initially scaffolded on Next 14; primeengage
   runs Next 16. Recommended upgrade and matched the entire toolchain
   (Next 16.2.4, React 19.2.4, @supabase/ssr 0.10.2, Tailwind v4) so the two
   repos move in lockstep. Cost: one reinstall. Benefit: no
   "works on primeengage, breaks on amb-primeengage" bugs.
3. **Read Next 16 docs from `node_modules/next/dist/docs/` before writing
   code.** Discovered:
   - `middleware.ts` is **deprecated in Next 16** — renamed to `proxy.ts`
     with `function proxy()` instead of `function middleware()`.
   - `cookies()` from `next/headers` is now **async** — must `await`.
   - Without reading first, the proxy.ts file would have been written under
     the old name and broken on build.
4. **Caught @supabase/ssr 0.10 cookies API change.** Old API used
   `get / set / remove` callbacks; new API uses `getAll / setAll`, with
   `setAll` receiving a second `headers` arg containing
   `Cache-Control: private, no-store` to prevent CDN caching of auth-cookie
   writes. Wrote it the new way from day one.
5. **Caught a bug in my own introspection script.** First version used
   `information_schema.constraint_column_usage` which **does not surface
   cross-schema FKs** like `amb_profiles.auth_user_id → auth.users.id`. Fixed
   to use `pg_constraint` directly so the schema dump tells the truth.
6. **Diagnosed a hydration warning that wasn't ours.** A console error pointed
   at `<input>` elements with `data-temp-mail-org="0"` injected — the **Temp
   Mail browser extension** mutating inputs before React hydrates. Applied
   `suppressHydrationWarning` (React's documented escape hatch) on the three
   inputs extensions touch most often, and **flagged the same fix as worth
   backporting to primeengage**.
7. **Discovered & documented an RLS gap that affects design.** Live
   `amb_profiles` has RLS enabled but **zero policies** — meaning
   `anon` / `authenticated` can read nothing. Confirmed reads currently work
   only via service-role bypass. Decision: admin UI uses service-role through
   `lib/supabase/admin.ts`, OK because we always check `role='admin'`
   server-side via the proxy. Real RLS policies queued in
   `docs/migration-tasks.md` for when the ambassador dashboard ships in
   Phase 2.

---

## 7. Documentation produced

| File | Purpose |
|---|---|
| `HANDOFF.md` | Inter-repo contract + critical rules (rule #6 reversed mid-build to require visual matching with primeengage). |
| `AGENTS.md` | Next 16 "read docs first" rule + companion-repo cheat sheet for future contributors. |
| `docs/database-schema.md` | Auto-generated live schema snapshot + Findings & Gaps section. Re-runnable. |
| `docs/admin-seed.md` | One-command admin seed procedure. |
| `docs/migration-tasks.md` | Deliberate Phase 1 → Phase 2 deviations log (SMTP→Resend, service-role placement, RLS policies, bucket-level enforcement) with **why we deviated** and **trigger to act**. |
| `docs/phase-1-status.md` | This file. |
| `supabase/README.md` | Migration policy ("never re-CREATE existing live objects"). |
| `supabase/migrations/0001_amb_profiles_rejected_at.sql` | The one schema change we made, idempotent. |
| `ambassador_platform_tech_doc.md` §4.1 | Updated to reflect `rejected_at`. |

---

## 8. What's deliberately deferred (Phase 2+) — and why

Tracking deliberate deviations from the original spec so they don't get
forgotten:

1. **Email: nodemailer/SMTP → Resend in a Supabase Edge Function.** Resend
   wasn't provisioned; SMTP creds were already working in primeengage. Trade-
   off accepted: service-role key sits in Vercel env (Phase 1) instead of
   Supabase secrets (Phase 2 ideal).
2. **RLS policies on `amb_profiles`.** Service-role-only reads are fine for
   admin UI; real `auth.uid() = auth_user_id` policies needed before the
   ambassador-side dashboard ships.
3. **Bucket-level size + MIME caps on `amb_applications`.** Currently
   enforced application-side only (per `lib/ambassador/types.ts`). Will set
   `file_size_limit` + `allowed_mime_types` on the bucket before public scale.
4. **Voucher code auto-generation, 2FA for admin, in-app notifications,
   multi-admin roles.** Per tech doc §12 Phase 4.

---

## 9. What's next

Phase 1 vertical slice is closed. Per tech doc §12 Phase 1, remaining work
inside Phase 1:

1. **Activities CRUD** — admin creates an activity (title, description,
   points, deadline, optional cover image); ambassador-side list + detail.
2. **Submission flow** — ambassador uploads files + optional text against an
   activity; one submission per ambassador per activity, locked on save.
3. **Points awarding** — admin reviews submission, awards points, ledger
   entry written.
4. **Events + Gallery** — admin posts; ambassador views.
5. **Chat** — Supabase Realtime; ambassador ↔ admin only.
6. **User analytics + leaderboard** — view-backed.

Each of these is a separate scoped slice — same architecture pattern as
applications (server-role read for admin, RLS for ambassador, route handler
for state-changing writes, branded admin chrome).

---

## 10. Build evidence

```
▲ Next.js 16.2.4 (Turbopack)
✓ Compiled successfully in 5.5s

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /admin/applications
├ ƒ /admin/applications/[id]
├ ƒ /api/admin/applications/[id]/approve
├ ƒ /api/admin/applications/[id]/reject
├ ○ /dashboard
└ ƒ /login
ƒ Proxy (Middleware)
```

`tsc --noEmit` clean. End-to-end smoke test (route protection + sign-in +
approve + reject + email) passes against the live Supabase project.

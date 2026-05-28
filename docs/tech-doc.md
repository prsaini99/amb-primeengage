# Yuvaah Club Platform — Technical Document

_Current state as of 2026-05-04. This is the canonical "if you're new to the codebase, read this first" doc; the older `ambassador_platform_tech_doc.md` at the repo root is the original pre-implementation spec and is now historical._

---

## 1. What this is

A two-sided web app powering Prime Engage's Yuvaah Club — a campus loyalty program. One Next.js app serves two role-gated dashboards:

- **Admin** (one operator) — reviews applications, posts activities/events/products, awards points on submissions, manages chat and orders, configures the loyalty tier ladder.
- **Yuvaah Club member** (formerly "Ambassador" in code identifiers) — applies via the public marketing site, completes activities to earn points, redeems points (or points + INR via Razorpay) for products in the store, chats 1:1 with the admin.

The same Supabase project is shared with the public marketing site repo at [`primeengage`](https://github.com/...) (separate Next.js app at `primeengage.in`). All tables, views, storage buckets, and RPC functions owned by this platform are prefixed `amb_*` so the two repos coexist without collisions.

---

## 2. Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack, Server Components, Server Actions) | 16.2.4 |
| Language | TypeScript | 5.x |
| UI runtime | React | 19.2.4 |
| Styling | Tailwind CSS v4 (`@theme inline` in `globals.css`) | 4.x |
| Icons | lucide-react | 1.8.0 |
| Backend | Supabase (Postgres + Auth + Storage) | hosted |
| Auth SSR | `@supabase/ssr` (cookie-based, `getAll`/`setAll` API) | 0.10.2 |
| Email | Gmail SMTP via `nodemailer` | 8.0.5 |
| Payments | Razorpay test mode (live integration ready) | 2.9.6 |
| Validation | Zod | 4.3.6 |
| Hosting | Vercel (planned) | — |

No Edge Functions in v1 — all server logic runs as Next.js Route Handlers, Server Components, and Server Actions. No Supabase Realtime in v1; chat polls every 5s.

---

## 3. High-level architecture

```
                         ┌─ marketing site ──────────────┐
                         │  primeengage repo (Next.js)   │
                         │  applies to Yuvaah Club here  │
                         └──────────────┬────────────────┘
                                        │  POST /api/applications
                                        ▼
┌────────────────────────────────────────────────────────────────┐
│  amb-primeengage (this repo, Next.js 16 App Router)            │
│                                                                 │
│  ┌─ Public ────────┐  ┌─ /dashboard (member) ┐  ┌─ /admin ───┐ │
│  │  / (landing)    │  │  home + tier ladder  │  │  apps      │ │
│  │  /login         │  │  activities          │  │  activities│ │
│  └─────────────────┘  │  events / gallery    │  │  events    │ │
│                       │  store + orders      │  │  gallery   │ │
│                       │  chat                │  │  chat      │ │
│                       └──────────────────────┘  │  products  │ │
│                                                 │  orders    │ │
│   proxy.ts ── role gate ─→ /login / /dashboard  │  tiers     │ │
│                                                 └────────────┘ │
│                                                                 │
│   Route Handlers (/api/*) · Server Actions · Server Components │
└────────────────────┬───────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┬────────────┐
        ▼            ▼            ▼              ▼            ▼
   Supabase    Supabase     Supabase        Razorpay      Gmail
   Postgres    Auth         Storage         (test)        SMTP
   amb_* ns    JWT role     amb_*           HMAC-SHA256   nodemailer
                            buckets         signed orders
```

**Key architectural choices** (and why):

- **App Router + Server Components** — most pages are server components that read directly via `createAdminClient()` (service role key, server-side only). Avoids the round-trip cost of client fetches and keeps the role gate in one place.
- **JWT `app_metadata.role`** — role is stamped into the auth user (not just a profile column) so [proxy.ts](../proxy.ts) can route-gate without ever hitting the DB.
- **Atomic Postgres functions for all money/points operations** — order creation, awarding, cancellation, and the hybrid checkout init/finalize are all single-RPC SQL functions with `FOR UPDATE` row locks. The app never directly mutates `amb_orders` or `amb_points_ledger`.
- **`amb_*` table prefix** — module boundary. Both repos query the same Postgres but neither's identifiers collide.

---

## 4. Repo layout

```
amb-primeengage/
├── app/
│   ├── (admin)/admin/            # admin dashboard (protected, role=admin)
│   │   ├── layout.tsx            # sidebar + header + role check
│   │   ├── applications/         # review pending applications
│   │   ├── activities/           # CRUD activities
│   │   ├── events/               # CRUD blog-style events
│   │   ├── gallery/              # upload images
│   │   ├── chat/                 # WhatsApp-style 1:1 with members
│   │   ├── products/             # CRUD store products
│   │   ├── orders/               # history + cancel + refund
│   │   ├── submissions/[id]/     # award points / adjust
│   │   └── tiers/                # 5-tier ladder editor (migration 0014)
│   ├── (ambassador)/dashboard/   # member dashboard (protected, role=ambassador)
│   │   ├── layout.tsx
│   │   ├── page.tsx              # home: balance, tier card, ladder, leaderboard
│   │   ├── activities/           # browse + submit
│   │   ├── events/, gallery/     # read-only
│   │   ├── store/, orders/       # browse + redeem + history
│   │   └── chat/                 # 1:1 with admin
│   ├── (public)/login/
│   ├── api/
│   │   ├── admin/                # admin-only endpoints
│   │   ├── chat/messages/        # shared (both roles can hit)
│   │   └── dashboard/            # member-only endpoints
│   ├── actions/                  # Server Actions (form handlers)
│   ├── layout.tsx, page.tsx, globals.css
├── components/
│   ├── admin/                    # admin-only UI atoms (forms, tables, chat)
│   ├── dashboard/                # member-only UI (redemption panel, etc.)
│   ├── chat/chat-thread.tsx      # shared chat polling component
│   └── logo.tsx, ...
├── lib/
│   ├── auth/                     # role gates (4 helpers, see §6)
│   ├── ambassador/types.ts       # Zod schemas for application payload
│   ├── supabase/
│   │   ├── admin.ts              # service-role client (server-only)
│   │   ├── server.ts             # SSR client (uses caller's session)
│   │   └── database.types.ts     # auto-generated from live schema
│   ├── tiers.ts                  # getUserTier() RPC wrapper
│   ├── razorpay.ts               # SDK wrapper + signature verifier
│   ├── mailer.ts                 # SMTP transport + 3 templated emails
│   └── utils.ts
├── proxy.ts                      # Next 16 middleware (role gate)
├── supabase/migrations/          # 15 migrations, see §10
├── scripts/                      # introspect-schema, generate-types, seed-admin
└── docs/                         # this file lives here
```

---

## 5. Data model

The auto-generated [docs/database-schema.md](./database-schema.md) is the source of truth for column types and indexes (rebuilt by `npm run supabase:introspect`). What follows is the relationship map and the invariants that aren't visible from a column list.

### 5.1 Tables (13 in `public.amb_*`)

| Table | Purpose | Key invariants |
|---|---|---|
| `amb_profiles` | Applicants, members, admin — one row per person | `auth_user_id` is null while `status='pending'`; set on approval. `role IN ('admin','ambassador')`. `email` unique, lowercased. |
| `amb_activities` | Tasks members can complete for points | `is_active` toggles visibility; `submission_deadline` enforced server-side. |
| `amb_submissions` | One per (user, activity); no resubmission | `UNIQUE(activity_id, user_id)`. Trigger `amb_submissions_enforce_window` rejects submissions past deadline or after archive. |
| `amb_submission_files` | Attachments | Cascade-deletes with submission. Storage path is `amb_submissions` bucket, prefix `<profile_id>/`. |
| `amb_points_ledger` | Append-only ledger of every points delta | Reasons: `submission_awarded`, `award_adjustment`, `admin_adjustment`, `order_redemption`. Balance = `SUM(delta)`. Lifetime earned = sum where reason ∈ `(submission_awarded, award_adjustment)`. |
| `amb_events` | Blog-style admin posts | — |
| `amb_gallery` | Image cards | — |
| `amb_chat_messages` | 1:1 admin↔member chat | RLS off; access mediated through API. `read_at` set when receiver fetches. |
| `amb_products` | Store inventory | `points_cost > 0 OR inr_cost > 0` (must cost something). v1 only supports `inr_cost = 0` (pure-points or hybrid-shortfall). Stock `null` = unlimited. |
| `amb_orders` | Redemption history | `payment_status ∈ ('not_required','pending','paid','failed')`. `fulfillment_status ∈ ('pending','fulfilled','cancelled')`. Hybrid orders carry `razorpay_order_id` + `payment_ref` (the payment id from checkout). |
| `amb_tiers` | 5-row loyalty ladder | `rank` PK 1–5. Tier 1 threshold must be 0 (UI-enforced). Strictly increasing thresholds. Each carries its own `points_to_inr_rate`. |

Two views: `amb_v_user_balances` (sum of ledger per user) and `amb_v_leaderboard` (lifetime earned, sorted).

### 5.2 Storage buckets

| Bucket | Public? | Used for |
|---|---|---|
| `amb_applications` | private | Student ID uploads at apply time (signed URLs) |
| `amb_submissions` | private | Activity submission files (signed URLs) |
| `amb_products` | public | Product images |
| `amb_events`, `amb_gallery` | public | Cover/gallery images |
| `amb_avatars` | public | Member profile pictures |

### 5.3 Points ledger semantics

The ledger is **append-only**. There is no UPDATE on existing rows; corrections write a new row.

| Reason | Sign | Source | Counts as "lifetime earned"? |
|---|---|---|---|
| `submission_awarded` | + | `amb_award_submission()` RPC | yes |
| `award_adjustment` | ± | `amb_adjust_award_submission()` RPC | yes (delta net) |
| `admin_adjustment` | ± | manual admin gift OR cancel-with-refund | no |
| `order_redemption` | − | `amb_create_order()` / `amb_finalize_paid_order()` | no |

Tier rank is derived from lifetime earned (see §7.3) — so spending points on store items never demotes a member.

---

## 6. Auth & access control

Three layers, defense in depth.

### 6.1 `proxy.ts` (Next 16 middleware)

Runs on every `/admin/*` and `/dashboard/*` request. Uses `@supabase/ssr` to read the auth cookie, calls `auth.getUser()` (verified — not the unverified `getSession()`), reads `app_metadata.role`. Redirects:

- Unauthenticated → `/login?redirect=<path>`
- Non-admin hitting `/admin/*` → `/dashboard`
- Admin hitting `/dashboard/*` → `/admin/applications`

Never queries the DB. Pure JWT-based gate so it stays on the edge / fast path.

### 6.2 `lib/auth/*` — server-side gates

Used by Server Components, Server Actions, and Route Handlers — re-verifies the session and pulls the matching `amb_profiles` row. The proxy is a routing convenience; these are the actual trust boundary.

| Helper | Use case | Failure mode |
|---|---|---|
| `requireAdmin()` | admin Server Components / actions / `/api/admin/*` | redirect to `/login` (page) or `{ ok: false }` (action) |
| `requireAmbassador()` | member Server Components | redirect |
| `requireAmbassadorForApi()` | member Route Handlers | returns a `Response` (401/403) |
| `requireProfile(roles)` | shared routes (chat) | mutual gate, supports both roles |

`get-admin-profile.ts` is a no-gate read — used to fetch the lone admin's profile for the chat header.

### 6.3 RLS

Every `amb_*` table has RLS **enabled** but no policies are defined. All access is service-role through `createAdminClient()` (server-only). The auth gates above are the actual access control. RLS-enabled-with-no-policies means a leaked anon key cannot read these tables — defense against misconfigured public clients.

---

## 7. Key business flows

### 7.1 Application → approval

1. **Apply** (on the marketing site). The public site posts to its own `/api/applications` endpoint, which inserts an `amb_profiles` row with `status='pending'`, `role='ambassador'`, `auth_user_id=NULL`. Application payload is validated by the shared Zod schema in `lib/ambassador/types.ts` (imported by both repos).
2. **Review** (admin). `/admin/applications` lists pending rows with a 7-field detail view.
3. **Approve** (`POST /api/admin/applications/[id]/approve`):
   - Generates a one-time password.
   - Calls `auth.admin.createUser()` with `email_confirm: true` and `app_metadata.role: 'ambassador'`.
   - Updates the profile: `auth_user_id`, `status='approved'`, `approved_at`.
   - Sends approval email with credentials via `lib/mailer.ts`.
4. **Reject** (`POST /api/admin/applications/[id]/reject`): flips status, sends polite rejection email. Profile row stays for analytics.

The applicant signs in at `/login` with the emailed password, hits `requireAmbassador()`, lands on `/dashboard`.

### 7.2 Activity submission → award

1. Member uploads files via `/api/dashboard/submissions/sign-upload` (signed URL) → uploads directly to Storage at `<profile_id>/<random>.<ext>`.
2. `POST /api/dashboard/submissions` creates the `amb_submissions` row + `amb_submission_files` rows. Trigger rejects if past deadline or activity archived.
3. Admin reviews at `/admin/submissions/[id]`.
4. **Award** (`POST /api/admin/submissions/[id]/award`) calls `amb_award_submission(submission_id, points)` RPC which:
   - Locks the submission row, verifies `status='submitted'`.
   - Sets `status='awarded'`, `awarded_points`.
   - Writes ledger row: `delta=+points, reason='submission_awarded', reference_id=submission_id`.
   - Sends award email.
5. **Adjust** (`POST /api/admin/submissions/[id]/adjust-award`) calls `amb_adjust_award_submission(submission_id, new_points)` which writes a `award_adjustment` ledger row with the delta (+ or −) and updates `awarded_points`. The original `submission_awarded` row is preserved.

Lifetime earned counts both reasons — admin corrections still count as earned.

### 7.3 Tier ladder (migration 0014–0015)

Five admin-managed tiers (Bronze/Silver/Gold/Platinum/Diamond seeded; admin can rename). Each carries:

- `threshold_points` — minimum lifetime earned to qualify
- `points_to_inr_rate` — the ₹/point rate used at hybrid checkout

The Postgres function `amb_user_tier(uuid)` derives a member's current tier from their lifetime earned and returns the matching tier row + `lifetime_earned` + `next_threshold`. Always returns one row in steady state because rank 1's threshold is fixed at 0.

Tier never demotes — derived from lifetime earned (an only-grows quantity), not current balance. Member dashboard shows the tier card + a 5-card ladder visual highlighting current rank.

Edits go through `/admin/tiers` which validates: rank 1 threshold = 0; thresholds strictly increasing; rates positive. Bulk upsert in one server action so admins can reorder thresholds without ever passing through an invalid intermediate state.

### 7.4 Pure-points redemption

1. Member clicks Redeem on a product where `balance >= points_cost`.
2. `POST /api/dashboard/orders` calls `amb_create_order(user_id, product_id)` which:
   - Locks product, validates active + in stock + `inr_cost = 0`.
   - Verifies `balance >= points_cost`.
   - Inserts `amb_orders` with `payment_status='not_required', fulfillment_status='fulfilled'` (auto-fulfilled — migration 0012 dropped the admin "mark fulfilled" gate).
   - Writes ledger debit (`order_redemption`).
   - Decrements stock.
3. Member sees order under "fulfilled" immediately. Admin can later cancel-with-refund (writes `admin_adjustment` credit).

### 7.5 Hybrid (points + INR) redemption

When `balance < points_cost`, the member can split: use some points + pay the shortfall in INR via Razorpay.

1. **Init** (`POST /api/dashboard/orders/payment-init`):
   - Computes shortfall server-side: `inr_paise = ceil((points_cost − points_to_use) × tier_rate × 100)`.
   - Tier rate from `getUserTier()` (RPC). Rejects if no tier matches (would only happen if tiers table was emptied).
   - Calls `amb_init_paid_order(user, product, points_to_use, inr_paise)` — creates a `pending` order (no ledger debit yet, no stock decrement yet). Function re-derives expected paise and rejects if the client's number is off by more than 1 paise — prevents under-charging.
   - Calls Razorpay `orders.create({ amount: inr_paise, ... })`. If this fails, rolls back via `amb_cancel_order`.
   - Returns `{ order_id, razorpay_order_id, amount_paise, key_id, prefill }`.
2. **Checkout** (client): `RedemptionPanel` injects `checkout.js`, opens the Razorpay modal with the returned config.
3. **Verify** (`POST /api/dashboard/orders/payment-verify`):
   - HMAC-SHA256 verifies `razorpay_signature` over `<order_id>|<payment_id>` (constant-time compare).
   - Verifies the `order_id` belongs to the caller.
   - Calls `amb_finalize_paid_order(order_id, payment_id)` which atomically: re-validates product still active + in stock, re-checks balance ≥ points_to_use (rare race window), flips `payment_status='paid'`, `fulfillment_status='fulfilled'`, writes ledger debit, decrements stock.
4. Member redirects to `/dashboard/orders`.

Failure modes:
- Modal dismissed → order stays `payment_status='pending'`. Member can retry from store.
- Bad signature → 400. Order stays `pending`.
- Stock/active changed during the ~10s window → finalize raises; admin handles refund manually via Razorpay dashboard, writes a note.

### 7.6 Order cancel / refund

`POST /api/admin/orders/[id]/cancel` → `amb_cancel_order(order_id, notes)`:
- Refuses if already `cancelled`.
- Sets `fulfillment_status='cancelled'`, optionally writes `admin_notes`.
- For pure-points orders (`payment_status='not_required'`): credits points back via `admin_adjustment` ledger row, restores stock.
- For paid hybrid orders: leaves money refund to admin (manual via Razorpay dashboard, recorded in notes). Stock restored.
- For pending hybrid orders: nothing to refund yet (no ledger debit happened at init).

### 7.7 Chat

WhatsApp-style 1:1 between admin and each member.

- **Member side**: `/dashboard/chat` shows the single thread with the lone admin.
- **Admin side**: `/admin/chat` shows a left-rail thread list (sorted: unread → most recent → alphabetical) with client-side selection switching the right pane without a route change.
- **Polling**: `ChatThread` hits `GET /api/chat/messages?with=<other_id>` every 5 seconds.
- **Send**: `POST /api/chat/messages` validates pairing rule (admin only chats with members; members only chat with admin). Same-role chats rejected.
- **Read receipts**: `POST /api/chat/messages/read` flips `read_at` on rows the receiver just saw.

---

## 8. External integrations

### 8.1 Razorpay (test mode → live-ready)

- SDK: `razorpay@2.9.6`. Wrapper at `lib/razorpay.ts` — lazy-instantiated Razorpay client mirroring the `lib/supabase/admin.ts` pattern; `verifySignature(orderId, paymentId, signature)` does the HMAC-SHA256 + constant-time compare.
- Env vars (3): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` (client-side checkout init).
- Test cards: India domestic only — `5267 3181 8797 5449` (Mastercard), OTP `1234`. International cards rejected by test gateway.
- Webhook: not implemented in v1. Client-side `handler` callback drives finalize. If a member closes the browser between successful payment and verify call, the order stays `pending` — admin sees it under "Awaiting payment" and can clean up. Webhook resilience is on the v1.5 roadmap.

### 8.2 Email (Gmail SMTP)

- `lib/mailer.ts` uses `nodemailer` with Gmail App Password (port 465, TLS). Three templated emails:
  - **Approval** — credentials, sign-in link.
  - **Rejection** — polite decline.
  - **Award** — points earned + new balance.
- HTML and plaintext bodies kept in lockstep with the public site's mailer (same `baseHtml` shell, same `kv` helper, same escape semantics) so both repos send visually consistent mail.

### 8.3 Supabase Storage

Five buckets (see §5.2). Member uploads always go through signed URLs scoped to `<profile_id>/` prefix — defense against a malicious client crafting a path under another member's namespace.

---

## 9. Security model

| Concern | Mitigation |
|---|---|
| Direct DB write from client | Service-role key is server-only. Client uses anon key (RLS-enabled tables with no policies → returns nothing). |
| Role escalation | `app_metadata.role` is set only by `auth.admin.*` calls (privileged Admin API), never by clients. |
| Mid-flight session tampering | Proxy + auth helpers all use `auth.getUser()` (verified) not `getSession()` (unverified). |
| Hybrid checkout under-pay | Client-supplied `points_to_use` and `inr_amount_paise` are re-derived inside the Postgres function and rejected if mismatched (1-paise tolerance). |
| Razorpay forged success | HMAC-SHA256 signature verification on the verify route + constant-time compare. |
| Cross-member uploads | Signed URLs scoped to caller's profile ID prefix; route handler enforces. |
| Cross-member chat reads | Pairing rule enforced in `/api/chat/messages` (admin↔member only). |
| SQL injection | All DB access is through the Supabase JS client which parameterizes; raw SQL only inside SECURITY DEFINER functions with typed args. |

Open items called out as v1.5+ work:
- Webhook for hybrid finalize (browser-close resilience).
- Rate limit on `/api/chat/messages` POST.
- Email-bounce handling on approval (currently no signal back if Gmail rejects).

---

## 10. Migration history

15 migrations, idempotent, applied via the Supabase Management API (`POST /v1/projects/<ref>/database/query`). The mirror at `../primeengage/supabase/schema.sql` is the unified DDL the marketing-site repo holds for documentation.

| # | File | What changed |
|---|---|---|
| 0001 | `amb_profiles_rejected_at` | Added `rejected_at` column. |
| 0002 | `activities_submissions_ledger` | Core tables: activities, submissions, files, ledger, balance/leaderboard views. Submission window trigger. |
| 0003 | `amb_submissions_bucket` | Storage bucket for uploads. |
| 0004 | `amb_award_submission_fn` | Atomic award RPC. |
| 0005 | `amb_adjust_award_fn` | Adjust-award RPC (initial version). |
| 0006 | `events_gallery` | Events + gallery tables + buckets. |
| 0007 | `amb_chat_messages` | Chat table. |
| 0008 | `products_orders_settings` | Store + orders + global settings + product image bucket. |
| 0009 | `amb_order_fns` | `amb_create_order`, `amb_cancel_order` (Phase 2 versions). |
| 0010 | `leaderboard_submission_only` | Tightened leaderboard view to count only earned reasons. |
| 0011 | `award_adjustment_reason` | New ledger reason `award_adjustment`; rewrote adjust function. |
| 0012 | `auto_fulfill_and_paid_orders` | Auto-fulfillment + hybrid Razorpay path: `amb_init_paid_order`, `amb_finalize_paid_order`. Drop fulfilled-blocks-cancel guard. |
| 0013 | `amb_orders_razorpay_order_id` | Stash Razorpay order id on our row for support correlation. |
| 0014 | `amb_tiers` | Tier table + `amb_user_tier(uuid)`. Switched `amb_init_paid_order` to tier-aware rate. |
| 0015 | `drop_amb_settings` | Retired global rate. Dropped `amb_settings` table + the fallback in `amb_init_paid_order`. |

Latest applied: 2026-05-04.

---

## 11. Operations

### 11.1 Local dev

```bash
npm install
cp .env.local.example .env.local   # fill in supabase + razorpay + smtp creds
npm run dev                        # http://localhost:3000
```

### 11.2 Scripts (`scripts/*.mjs`)

| Script | Run with | Purpose |
|---|---|---|
| `introspect-schema.mjs` | `npm run supabase:introspect` | Dumps live schema → `docs/database-schema.md` + `scripts/.schema-cache.json`. |
| `generate-types.mjs` | `npm run supabase:types` | Regenerates `lib/supabase/database.types.ts` from the cache. |
| `seed-admin.mjs` | `npm run seed:admin` | One-shot: creates the lone admin auth user with `app_metadata.role='admin'` + matching profile. |

After every applied migration: re-run introspect + types so the TypeScript layer matches the live schema.

### 11.3 Required env vars

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_TOKEN=                   # Management API PAT, used by scripts
SUPABASE_URL=                     # same as the public URL, used by scripts

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=ops@primeengage.in
SMTP_PASS=<16-char Google App Password>
MAIL_FROM=Prime Engage <ops@primeengage.in>
```

`.env.local.example` mirrors the keys with placeholder values — keep it in sync when adding new env vars.

### 11.4 Verifying a build

```bash
npx tsc --noEmit       # type-check
npm run build          # full Next.js production build (catches SSR / import-boundary issues)
```

Both should be clean before merging. Build also catches stale Next-generated types (`.next/types/validator.ts`) — if you delete a route, also `rm -rf .next` to drop the cache.

### 11.5 Cross-repo coordination

The marketing repo at `../primeengage/`:
- Holds its own `supabase/schema.sql` mirror — updated by hand whenever a new migration lands here.
- Imports `lib/ambassador/types.ts` shape via copy/sync; both repos run identical Zod validation on application payloads.
- Hits the same Supabase project (read access for the public listing of recent ambassadors / marketing pages, write access only via the `/api/applications` POST that creates `amb_profiles` rows).

When changing any cross-repo contract (table column, application payload shape, role string), update both repos in lockstep.

---

## 12. Roadmap (out of scope for v1)

- Razorpay webhook for browser-close resilience on hybrid finalize.
- Auto-refund money via Razorpay API on admin-cancel of paid orders.
- Voucher code auto-generation (currently admin pastes codes into `admin_notes`).
- Multi-admin chat routing (single admin assumed throughout).
- Stock reservation at hybrid init time (last-unit race during the ~10s payment window — accepted at launch volume).
- SMS/WhatsApp notifications.
- Realtime chat (replace 5s polling).

---

_Last updated: 2026-05-04 by the engineering team. For the granular column-level schema, see [database-schema.md](./database-schema.md). For migration runbooks, see [migration-tasks.md](./migration-tasks.md)._

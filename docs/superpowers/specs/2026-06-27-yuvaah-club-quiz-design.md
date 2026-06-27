# Yuvaah Club Quiz — Design Spec

**Date:** 2026-06-27
**Status:** Approved for planning
**Repos affected:** `primeengage` (schema + CTA), `amb-primeengage` (feature + admin)

**Chosen UI theme (2026-06-27):** `clean` — light/minimal, paper background, navy text, cyan selected-state, amber CTA. Selected by client from the Phase 0 preview (variants `clean` / `brand` / `playful`). The member quiz UI ships with `theme="clean"`.

---

## 1. Summary

Embed a general-knowledge quiz for Yuvaah Club members. The quiz is **dormant by default**; admins activate one **round** at a time. Each member may attempt the **active round once**, receiving a **random 10 questions** drawn from that round's pool. Each correct answer is worth **10 points (max 100)**, and the score is **credited to the member's ambassador points ledger** (counting toward the leaderboard and redeemable for products).

Conceptually inspired by the WongaWits platform (`student-success-path`), but **none of its proctoring/anti-cheat is carried over**, and unlike WongaWits the questions are **admin-curated**, organized into **rounds**, and gated behind **member login**.

### Decisions locked during brainstorming

| Topic | Decision |
|---|---|
| Where the quiz runs | Inside `amb-primeengage` (where members already log in), surfaced by a CTA on `primeengage.in/yuvaah-club`. "Embed" = prominent entry point, not an iframe. |
| Question set | Per-round **pool**; each member served a **random 10**, locked once drawn. |
| Categories | Tags on questions (Sports, Movies, etc.) for organization — not a draw constraint. |
| Question format | 4-option, single-correct MCQ; 10 pts each; **100 max**; no negative marking. |
| Authoring | **CSV bulk upload** to populate a round's pool + manual add/edit/delete. |
| Anti-cheat / proctoring | **None.** No webcam, tab/fullscreen/copy-paste/devtools detection, fingerprint, or device gate. |
| Devices | **Any device** (responsive, mobile + desktop). |
| Timer | **Optional, admin-set per round** (blank/0 = no limit; otherwise auto-submit on expiry). |
| Attempts | **Strictly one per round** (no retake). **One round active at a time.** |
| Scoring | **Server-side only**; `correct_index` never sent to the client. |
| Points integration | Score credited to `amb_points_ledger` as new reason `quiz_score`; counts toward leaderboard, tier, and redeemable balance. |
| Backend | Next.js server actions + route handlers in `amb-primeengage` (service-role client). No Deno edge functions. |
| Results to member | Score + correct/wrong/unanswered breakdown + points credited. **Correct answers NOT shown.** No AI report. |
| Question media | Text-only for v1 (images = future extension). |

---

## 2. Architecture

Both apps share one Supabase project (`zpciertrkqwzuuektzpj`), so the quiz tables are visible to both. Per the `amb-primeengage` HANDOFF contract, only the applicant-flow schema (`amb_profiles`, `amb_applications` bucket, `admin_overview`) originates in `primeengage`; **all other module schema — including everything the quiz adds — is owned by `amb-primeengage`'s own numbered migrations** (`supabase/migrations/`). The objects the quiz alters (`amb_points_ledger` reason, `amb_v_leaderboard`, `amb_user_tier`) were themselves created by `amb-primeengage` migrations 0010/0011/0014, so the quiz migration lives here too. `primeengage` is touched only for the marketing-page CTA.

```
amb-primeengage  (member dashboard + admin — schema + feature owner)
  supabase/migrations/0017_yuvaah_quiz.sql  ← yuvaah_quiz_* tables + ledger reason + leaderboard/tier updates
  app/(ambassador)/quiz/...        ← member quiz-taking flow (gated by require-ambassador)
  app/api/quiz/assign/route.ts     ← draw + lock random 10
  app/api/quiz/submit/route.ts     ← server-side score + credit points (idempotent)
  app/actions/quizzes.ts           ← admin round + question CRUD, activate/deactivate
  app/(admin)/admin/quizzes/...    ← admin panel (follows the activities CRUD pattern)
  components/...                   ← quiz UI + admin forms

primeengage  (marketing site — CTA only)
  app/(site)/yuvaah-club/page.tsx  ← "Take the Quiz" CTA → absolute URL to dashboard quiz
```

---

## 3. Data model

All new tables prefixed `yuvaah_quiz_`. RLS enabled, **no policies** (service-role-only access, matching the existing app convention). Migration authored in `amb-primeengage/supabase/migrations/0017_yuvaah_quiz.sql`.

### 3.1 `yuvaah_quiz_rounds`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `title` | text not null | |
| `description` | text | |
| `status` | text not null check in (`'draft'`,`'active'`,`'closed'`) default `'draft'` | |
| `time_limit_seconds` | int | nullable / 0 = no timer |
| `points_per_correct` | int not null default 10 | |
| `questions_per_attempt` | int not null default 10 | |
| `created_by` | uuid fk `amb_profiles(id)` | |
| `created_at` | timestamptz default now() | |
| `activated_at` | timestamptz | |
| `closed_at` | timestamptz | |

**Single-active invariant:** at most one row with `status='active'`. Enforced by a **partial unique index** on `status` where `status='active'` (`create unique index ... on yuvaah_quiz_rounds ((status)) where status='active'`), plus app-level checks in the activate action.

### 3.2 `yuvaah_quiz_questions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `round_id` | uuid fk `yuvaah_quiz_rounds(id)` on delete cascade | |
| `category` | text | tag (Sports, Movies, …) |
| `question` | text not null | |
| `option_a`..`option_d` | text not null | |
| `correct_index` | smallint not null check 0..3 | **⚠️ service-role-only; never SELECTed by any client-facing query** |
| `created_at` | timestamptz default now() | |

### 3.3 `yuvaah_quiz_attempts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `round_id` | uuid fk `yuvaah_quiz_rounds(id)` | |
| `profile_id` | uuid fk `amb_profiles(id)` | |
| `status` | text not null check in (`'in_progress'`,`'completed'`) default `'in_progress'` | |
| `assigned_question_ids` | jsonb not null | the locked random 10 (ordered) |
| `answers` | jsonb default `'{}'` | `{ "<question_id>": 0..3 \| null }` |
| `score` | int | set on completion |
| `correct_count` / `wrong_count` / `unanswered_count` | int | set on completion |
| `started_at` | timestamptz default now() | |
| `completed_at` | timestamptz | |
| `points_ledger_id` | uuid fk `amb_points_ledger(id)` | set once on credit; idempotency guard |

**One attempt per round:** `unique (round_id, profile_id)`.

### 3.4 `amb_points_ledger` changes (same migration, `amb-primeengage`)

1. Extend the CHECK constraint to include `'quiz_score'`:
   `reason in ('submission_awarded','order_redemption','admin_adjustment','award_adjustment','quiz_score')`.
2. **`amb_v_leaderboard`** — add `'quiz_score'` to its `reason in (...)` filter so quiz points count toward leaderboard ranking.
3. **Tier-derivation function** (`reason in ('submission_awarded','award_adjustment')`) — add `'quiz_score'` so quiz points count toward tier progression.
4. **`amb_v_user_balances`** sums all deltas (no reason filter) → quiz points are automatically redeemable. No change needed; verify during implementation.

> Open confirmation: counting quiz points toward **tier** and **leaderboard** follows the stated intent ("counting toward the leaderboard and redeemable"). If quiz points should be redeemable but excluded from tier/leaderboard ranking, drop changes (2) and (3).

---

## 4. Member flow (`amb-primeengage`, `app/(ambassador)/quiz`)

Gated by the existing `require-ambassador` guard. Fully responsive.

1. **Entry** — CTA on `primeengage.in/yuvaah-club` links to the dashboard quiz route (absolute URL via env var, e.g. `NEXT_PUBLIC_DASHBOARD_URL`). CTA is always visible.
2. **Landing / gate:**
   - No active round → **dormant** screen: "No active quiz right now."
   - Member already has a `completed` attempt for the active round → "You've already attempted this round" + their score.
   - Member has an `in_progress` attempt → **Resume** (same locked 10).
   - Otherwise → **Start** (with optional short T&C copy — no camera/rules page).
3. **Assign** — `POST /api/quiz/assign`:
   - Creates the attempt row (or returns the existing one) — **idempotent**.
   - On first call, draws `questions_per_attempt` random question ids from the round pool and stores them in `assigned_question_ids` (locked; re-entry returns the same set).
   - Returns the questions **without** `correct_index`.
   - Concurrency: rely on `unique(round_id, profile_id)` to collapse races to one attempt.
4. **Quiz page** — 10 MCQs, progress indicator, question navigator, optional countdown (from `time_limit_seconds`, computed against `started_at`). Answers snapshot to `answers` on each selection (refresh-resilient). Timer expiry triggers auto-submit.
5. **Submit** — `POST /api/quiz/submit` (manual or on expiry):
   - Idempotent (no-op if already `completed`).
   - Server scores `answers` against `correct_index` for the assigned ids: `score = correct_count * points_per_correct`.
   - Sets attempt to `completed`, writes counts, and **credits points exactly once**: insert one `amb_points_ledger` row (`delta = score`, `reason = 'quiz_score'`, `reference_id = attempt.id`), store its id in `points_ledger_id`.
6. **Results** — score, correct/wrong/unanswered, points credited. Correct answers are **not** revealed.

---

## 5. Admin panel (`amb-primeengage`, `app/(admin)/admin/quizzes`)

Follows the existing `activities` CRUD pattern (`requireAdmin()` gate, service-role client, `PageHeading`/`TableShell` components, `useActionState` forms).

- **List `/admin/quizzes`** — rounds with status badge (draft/active/closed) + participant count + question-pool size.
- **New / edit round** — title, description, `time_limit_seconds` (blank = none), `points_per_correct`, `questions_per_attempt`.
- **Question pool `/admin/quizzes/[id]/questions`:**
  - **CSV upload** — columns `question, option_a, option_b, option_c, option_d, correct (letter A–D or index 0–3), category`. Validate rows, show a preview + per-row errors before commit.
  - Manual add / edit / delete of individual questions.
  - Guard: warn if pool size < `questions_per_attempt`.
- **Activate / deactivate** — activating sets `status='active'` and `activated_at` (and closes/blocks any other active round → enforces single-active); deactivating sets `status='closed'` and `closed_at`, returning the platform to dormant. **Pool-edit rule:** rounds are editable only while `status='draft'`; **activating freezes the question pool**. To change questions, close the round and create a new one (matches "new question set per round" semantics). A `closed` round cannot be re-activated.
- **Responses `/admin/quizzes/[id]/responses`** — per participant: name, score, correct/wrong/unanswered, submitted time, and their actual answers vs the correct answer (admin-only view via service role). No violations/snapshots (no proctoring).

---

## 6. Security & integrity

- `correct_index` is only ever read server-side (service-role); never returned to the client.
- Scoring is server-side; clients submit only selected option indices.
- `unique(round_id, profile_id)` + status checks prevent re-attempts even under refresh/race.
- Assignment is idempotent and locked → members cannot reshuffle for easier questions.
- Points credited exactly once, guarded by `points_ledger_id` + `reference_id = attempt.id`.

---

## 7. Build order (respects design-first workflow)

1. **Member quiz UI — base design first, then theme variants for client pick** before backend wiring (per established workflow). Static/mocked data initially.
2. Schema migration in `amb-primeengage` (`0017_yuvaah_quiz.sql`: tables + ledger reason + view/tier updates).
3. Backend: `assign` / `submit` route handlers + admin `quizzes` server actions.
4. Admin panel CRUD + CSV upload + responses view.
5. `primeengage` `/yuvaah-club` CTA.
6. Wire member UI to backend; verify end-to-end.

---

## 8. Testing & verification

- **Unit:** scoring math, CSV parse/validation, random-draw + lock, points-credit idempotency.
- **Integration:** one-attempt-per-round constraint, idempotent assign/submit, single-active-round invariant, ledger credit + leaderboard/tier/balance reflect `quiz_score`.
- **Manual:** dormant gate, already-attempted gate, resume, timer auto-submit, mobile layout, admin CSV upload + activation + responses.
- Verify only touched files (no full suite run).

---

## 9. Out of scope (v1)

- Webcam/mic proctoring, anti-cheat detection, device fingerprint, desktop-only gate.
- AI-generated mentor report (WongaWits-specific).
- Image/media questions.
- Retakes / multiple attempts per round.
- Multiple simultaneously-active rounds.

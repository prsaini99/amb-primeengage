# Yuvaah Club Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-controlled, round-based general-knowledge quiz for Yuvaah Club members: dormant by default, one attempt per active round, 10 random MCQs per member, 10 points each (max 100) credited to the ambassador points ledger.

**Architecture:** Feature lives in `amb-primeengage` (member dashboard + admin), surfaced by a CTA on `primeengage.in/yuvaah-club`. Both apps share one Supabase project; the quiz schema is authored as an `amb-primeengage` migration (`0017`), consistent with where the `amb_*` module schema it extends already lives. Secure scoring is server-side via Next.js route handlers using the service-role client; the answer key (`correct_index`) is never sent to clients. No proctoring/anti-cheat.

**Tech Stack:** Next.js 16.2.4 (App Router, React 19), Supabase (Postgres + Auth), TypeScript, Tailwind v4, Zod 4, vitest (new, scoped to `lib/quiz`).

## Global Constraints

- **Next.js is modified (Next 16).** Before writing any Next-specific code in either repo, read the relevant guide under `node_modules/next/dist/docs/`. Do NOT use `headers()`/`cookies()`/Supabase auth inside `unstable_cache`. Avoid chained server `redirect()`s from redirect hubs.
- **Quiz schema is owned by `amb-primeengage`** (`supabase/migrations/0017_yuvaah_quiz.sql`). Per the HANDOFF contract only the applicant-flow schema (`amb_profiles`, `amb_applications`, `admin_overview`) originates in `primeengage`; all other `amb_*` module objects — including the ledger reason / leaderboard / tier objects this quiz alters (created by `amb-primeengage` migrations 0010/0011/0014) — live in `amb-primeengage`. `primeengage` keeps no `schema.sql` mirror for these; it is touched only for the CTA.
- **All new tables:** prefix `yuvaah_quiz_`, RLS enabled, **no policies** (service-role-only access).
- **`correct_index` is service-role-only** — never returned by any client-facing query or route response.
- **Question format:** 4-option single-correct MCQ; `points_per_correct` default 10; max 100; no negative marking.
- **One attempt per round** (`unique(round_id, profile_id)`); **one round active at a time** (partial unique index on `status='active'`); **pool freezes on activation** (only `draft` rounds editable); **closed rounds cannot be re-activated**.
- **Points credit:** new ledger reason `'quiz_score'`; counts toward leaderboard, tier, and redeemable balance.
- **Commit policy (user instruction, this session):** do NOT create branches and do NOT commit. Work in-place on `main`, leave changes uncommitted for the user to review. The per-task `git commit` steps written in later tasks are therefore SKIPPED this session (kept in the doc for when committing resumes).
- **Verification:** run `npm run typecheck` + `npm run lint` for touched code; `npx vitest run lib/quiz` for the logic lib; manual for UI/DB flows. Do NOT run a full test suite (none exists).
- **Migrations applied** via the Supabase **Management API** (`POST /v1/projects/zpciertrkqwzuuektzpj/database/query` with a valid PAT) per `supabase/README.md` rule 3 — the connected MCP token does NOT have access to this project. No local Supabase stack. Never apply to the live shared DB without explicit user go-ahead.
- **Spec:** `amb-primeengage/docs/superpowers/specs/2026-06-27-yuvaah-club-quiz-design.md`.

---

## File Structure

### `primeengage` (CTA only)
- Modify `app/(site)/yuvaah-club/page.tsx` — add "Take the Quiz" CTA.
- Modify `.env` / env docs — add `NEXT_PUBLIC_DASHBOARD_URL`.

### `amb-primeengage` (schema + feature + admin)
- Create `supabase/migrations/0017_yuvaah_quiz.sql` — tables, indexes, single-active index, ledger reason, leaderboard view + tier fn updates. (No `schema.sql` in this repo; migrations are the source of truth.)
- Modify `lib/supabase/database.types.ts` — regenerated after migration.
- Create `lib/quiz/types.ts` — shared types.
- Create `lib/quiz/scoring.ts` — pure scoring.
- Create `lib/quiz/draw.ts` — pure random draw.
- Create `lib/quiz/csv.ts` — pure CSV parse/validate.
- Create `lib/quiz/__tests__/{scoring,draw,csv}.test.ts` — vitest.
- Create `vitest.config.ts`; modify `package.json` (devDep + scoped `test` script).
- Create `app/api/quiz/assign/route.ts`, `app/api/quiz/submit/route.ts`.
- Create `app/actions/quizzes.ts` — admin server actions.
- Create `app/(ambassador)/quiz/page.tsx` (gate/landing), `app/(ambassador)/quiz/play/page.tsx`, `app/(ambassador)/quiz/result/page.tsx`.
- Create `components/quiz/quiz-runner.tsx`, `components/quiz/question-card.tsx`, `components/quiz/quiz-timer.tsx`, `components/quiz/result-card.tsx`.
- Create `app/(admin)/admin/quizzes/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `[id]/questions/page.tsx`, `[id]/responses/page.tsx`.
- Create `components/admin/quiz-form.tsx`, `components/admin/question-form.tsx`, `components/admin/quiz-csv-upload.tsx`.
- Modify admin sidebar nav (`app/(admin)/admin/layout.tsx` or its nav component) — add "Quizzes" link.

---

## Phase 0 — Member quiz UI: design-first (no backend)

> Per the established workflow: build the base member-facing quiz UI, then 2–3 theme variants, and let the client pick before any backend is wired. Uses static/mock data only.

### Task 0: Static quiz UI + theme variants for client pick

**Files:**
- Create: `components/quiz/quiz-runner.tsx`, `components/quiz/question-card.tsx`, `components/quiz/quiz-timer.tsx`, `components/quiz/result-card.tsx`
- Create: `app/(ambassador)/quiz/preview/page.tsx` (temporary mock harness — deleted in Task 16)

**Interfaces:**
- Produces: `QuizRunner` client component consuming a `QuizViewModel` (defined in Task 4 `lib/quiz/types.ts`; for now declare a local mock type with the same shape: `{ attemptId: string; questions: { id: string; question: string; options: string[] }[]; timeLimitSeconds: number | null; pointsPerCorrect: number }`).

- [ ] **Step 1: Build the base quiz UI** with mock data: a `QuizRunner` showing one `QuestionCard` at a time (4 options, single-select), a progress indicator, a question navigator (jump grid), Prev/Next, an optional `QuizTimer` (counts down from `timeLimitSeconds`, hidden when null), and a Submit button on the last question. Add a `ResultCard` (score, correct/wrong/unanswered, points credited). Fully responsive (mobile-first; verify at 360px width). Use existing Tailwind tokens from `app/globals.css` (paper, navy-900, cyan-500, amber-500) and `components/ui` primitives where present. NO network calls — accept all data/handlers as props.
- [ ] **Step 2: Produce 2–3 theme variants** of the runner (e.g. "Clean/light", "Brand-gradient/dark", "Playful/cards") via a `theme` prop or wrapper class set, rendered side-by-side in `app/(ambassador)/quiz/preview/page.tsx`.
- [ ] **Step 3: Verify** `npm run typecheck` passes and the preview renders at `/quiz/preview`. Run the app (see /run) and screenshot each theme at mobile + desktop widths.
- [ ] **Step 4: Client checkpoint** — present the themes; client picks one. Record the choice in the spec doc (append a "Chosen theme" note). Do NOT proceed to backend wiring until a theme is chosen.
- [ ] **Step 5: Commit**

```bash
git add components/quiz app/\(ambassador\)/quiz/preview docs/superpowers/specs
git commit -m "feat(quiz): static member quiz UI + theme variants for client pick"
```

---

## Phase 1 — Database schema (`amb-primeengage`)

### Task 1: Quiz schema migration

**Files:**
- Create: `amb-primeengage/supabase/migrations/0017_yuvaah_quiz.sql` (next number after 0016; matches the repo's migration house style — uppercase keywords, dated header). No `schema.sql` mirror — this repo's migrations are the source of truth.

> Status: file already authored (see the real file at `supabase/migrations/0017_yuvaah_quiz.sql`); NOT YET APPLIED to the live project pending DB-access decision.

**Interfaces:**
- Produces: tables `yuvaah_quiz_rounds`, `yuvaah_quiz_questions`, `yuvaah_quiz_attempts`; ledger reason `'quiz_score'` valid; leaderboard + tier count `'quiz_score'`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0017_yuvaah_quiz.sql — Yuvaah Club quiz: rounds, questions, attempts.

-- Rounds ---------------------------------------------------------------------
create table if not exists public.yuvaah_quiz_rounds (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text,
  status                text not null default 'draft'
                         check (status in ('draft','active','closed')),
  time_limit_seconds    int  check (time_limit_seconds is null or time_limit_seconds >= 0),
  points_per_correct    int  not null default 10 check (points_per_correct >= 0),
  questions_per_attempt int  not null default 10 check (questions_per_attempt > 0),
  created_by            uuid references public.amb_profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  activated_at          timestamptz,
  closed_at             timestamptz
);
-- At most one active round at a time.
create unique index if not exists yuvaah_quiz_rounds_one_active_idx
  on public.yuvaah_quiz_rounds ((status)) where status = 'active';
create index if not exists yuvaah_quiz_rounds_status_idx on public.yuvaah_quiz_rounds (status);
alter table public.yuvaah_quiz_rounds enable row level security;

-- Questions (pool per round). correct_index is service-role-only. ------------
create table if not exists public.yuvaah_quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.yuvaah_quiz_rounds(id) on delete cascade,
  category      text,
  question      text not null,
  option_a      text not null,
  option_b      text not null,
  option_c      text not null,
  option_d      text not null,
  correct_index smallint not null check (correct_index between 0 and 3),
  created_at    timestamptz not null default now()
);
create index if not exists yuvaah_quiz_questions_round_idx on public.yuvaah_quiz_questions (round_id);
alter table public.yuvaah_quiz_questions enable row level security;

-- Attempts (one per member per round). --------------------------------------
create table if not exists public.yuvaah_quiz_attempts (
  id                    uuid primary key default gen_random_uuid(),
  round_id              uuid not null references public.yuvaah_quiz_rounds(id) on delete cascade,
  profile_id            uuid not null references public.amb_profiles(id) on delete cascade,
  status                text not null default 'in_progress'
                         check (status in ('in_progress','completed')),
  assigned_question_ids jsonb not null,
  answers               jsonb not null default '{}'::jsonb,
  score                 int,
  correct_count         int,
  wrong_count           int,
  unanswered_count      int,
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  points_ledger_id      uuid references public.amb_points_ledger(id) on delete set null,
  unique (round_id, profile_id)
);
create index if not exists yuvaah_quiz_attempts_round_idx   on public.yuvaah_quiz_attempts (round_id);
create index if not exists yuvaah_quiz_attempts_profile_idx on public.yuvaah_quiz_attempts (profile_id);
alter table public.yuvaah_quiz_attempts enable row level security;

-- Ledger reason: allow quiz_score -------------------------------------------
alter table public.amb_points_ledger drop constraint if exists amb_points_ledger_reason_check;
alter table public.amb_points_ledger add constraint amb_points_ledger_reason_check
  check (reason in ('submission_awarded','order_redemption','admin_adjustment','award_adjustment','quiz_score'));

-- Leaderboard: count quiz_score as earned -----------------------------------
create or replace view public.amb_v_leaderboard as
select
  p.id          as user_id,
  p.first_name,
  p.last_name,
  coalesce(sum(l.delta), 0)::int as total_earned
from public.amb_profiles p
left join public.amb_points_ledger l
  on l.user_id = p.id
  and l.reason in ('submission_awarded','award_adjustment','quiz_score')
where p.role = 'ambassador' and p.status = 'approved'
group by p.id, p.first_name, p.last_name
order by total_earned desc;

-- Tier: count quiz_score as earned ------------------------------------------
drop function if exists public.amb_user_tier(uuid);
create function public.amb_user_tier(p_user_id uuid)
returns table (
  tier_rank               int,
  tier_name               text,
  tier_threshold_points   int,
  tier_points_to_inr_rate numeric,
  lifetime_earned         int,
  next_threshold          int
)
language plpgsql
stable
as $$
declare
  v_earned int;
begin
  select coalesce(sum(delta), 0)::int into v_earned
    from public.amb_points_ledger
   where user_id = p_user_id
     and reason in ('submission_awarded', 'award_adjustment', 'quiz_score');

  return query
    with current_tier as (
      select t.rank, t.name, t.threshold_points, t.points_to_inr_rate
        from public.amb_tiers t
       where t.threshold_points <= v_earned
       order by t.rank desc
       limit 1
    )
    select
      c.rank, c.name, c.threshold_points, c.points_to_inr_rate,
      v_earned,
      (select min(t2.threshold_points)::int
         from public.amb_tiers t2 where t2.rank > c.rank)
      from current_tier c;
end;
$$;
```

  *(The authored file lives at `amb-primeengage/supabase/migrations/0017_yuvaah_quiz.sql` with uppercase house-style keywords; the lowercase block above is the canonical content.)*

- [ ] **Step 2: Apply the migration** — BLOCKED ON DB ACCESS. The connected MCP cannot see project `zpciertrkqwzuuektzpj`, so apply via the Supabase Management API (`POST https://api.supabase.com/v1/projects/zpciertrkqwzuuektzpj/database/query`) with a valid PAT once provided, per `supabase/README.md` rule 3 — OR have the user run the file in the Supabase SQL editor. Do not apply without explicit user go-ahead (live shared production DB).
- [ ] **Step 3: Verify** (after apply) by running this read-only check against the live DB:

```sql
select count(*) from public.yuvaah_quiz_rounds;          -- 0, table exists
select pg_get_constraintdef(oid) from pg_constraint where conname='amb_points_ledger_reason_check'; -- includes quiz_score
-- single-active index blocks a 2nd active row:
insert into yuvaah_quiz_rounds (title,status) values ('a','active');
insert into yuvaah_quiz_rounds (title,status) values ('b','active'); -- expect: duplicate key error
delete from yuvaah_quiz_rounds where title in ('a','b');
```
Expected: first insert OK, second fails with unique violation, then cleanup.
- [ ] **Step 4: Update the migration header** to record the applied date (matching the 0011 convention). No git commit (user preference: no commits this session).

### Task 2: Regenerate Supabase types (`amb-primeengage`)

**Files:** Modify `amb-primeengage/lib/supabase/database.types.ts`

> Depends on Task 1 being **applied** to the live DB (the generator introspects it) and on DB access (PAT/conn string in env). BLOCKED until then. If type regen stays blocked, the route-handler tasks can fall back to hand-written row types in `lib/quiz/types.ts` to avoid a hard dependency on the generated file.

- [ ] **Step 1:** Run `npm run supabase:types` (regenerates from the live schema).
- [ ] **Step 2: Verify** the file now contains `yuvaah_quiz_rounds`, `yuvaah_quiz_questions`, `yuvaah_quiz_attempts` under `Tables`. Run `npm run typecheck`.
- [ ] **Step 3:** No commit (user preference: no commits this session).

---

## Phase 2 — Pure logic lib + tests (`amb-primeengage`)

### Task 3: Add vitest (scoped to `lib/quiz`)

**Files:** Create `vitest.config.ts`; Modify `package.json`

- [ ] **Step 1:** `npm install -D vitest@^2`
- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/quiz/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3:** Add to `package.json` scripts: `"test": "vitest run lib/quiz"`.
- [ ] **Step 4: Verify** `npx vitest run lib/quiz` runs (0 tests, exits 0).
- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest scoped to lib/quiz"
```

### Task 4: Shared quiz types

**Files:** Create `lib/quiz/types.ts`

**Interfaces:**
- Produces:
```ts
export type AttemptAnswers = Record<string, number | null>; // questionId -> 0..3 | null
export type QuizQuestionRow = {
  id: string; round_id: string; category: string | null;
  question: string; option_a: string; option_b: string; option_c: string; option_d: string;
  correct_index: number; created_at: string;
};
export type PublicQuestion = { id: string; question: string; options: [string, string, string, string] };
export type ScoreResult = { score: number; correctCount: number; wrongCount: number; unansweredCount: number };
export type QuizViewModel = {
  attemptId: string;
  questions: PublicQuestion[];
  timeLimitSeconds: number | null;
  pointsPerCorrect: number;
  startedAtIso: string;
};
```

- [ ] **Step 1:** Write the types above.
- [ ] **Step 2: Verify** `npm run typecheck`.
- [ ] **Step 3: Commit** `git add lib/quiz/types.ts && git commit -m "feat(quiz): shared types"`

### Task 5: Random draw (TDD)

**Files:** Create `lib/quiz/draw.ts`, `lib/quiz/__tests__/draw.test.ts`

**Interfaces:**
- Produces: `drawRandom(ids: string[], n: number, rand?: () => number): string[]` — returns `min(n, ids.length)` unique ids; deterministic when `rand` supplied.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { drawRandom } from "../draw";

describe("drawRandom", () => {
  it("returns n unique ids from the pool", () => {
    const pool = ["a","b","c","d","e"];
    const out = drawRandom(pool, 3, mulberry(42));
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    out.forEach((id) => expect(pool).toContain(id));
  });
  it("caps at pool size when n exceeds it", () => {
    expect(drawRandom(["a","b"], 5, mulberry(1))).toHaveLength(2);
  });
  it("is deterministic for a fixed rng", () => {
    expect(drawRandom(["a","b","c","d"], 2, mulberry(7)))
      .toEqual(drawRandom(["a","b","c","d"], 2, mulberry(7)));
  });
});
// seeded PRNG for tests
function mulberry(seed: number) { return () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}; }
```

- [ ] **Step 2: Run** `npx vitest run lib/quiz/__tests__/draw.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// lib/quiz/draw.ts — Fisher–Yates partial shuffle, optional injected rng.
export function drawRandom(ids: string[], n: number, rand: () => number = Math.random): string[] {
  const a = ids.slice();
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}
```

- [ ] **Step 4: Run** the test — expect PASS.
- [ ] **Step 5: Commit** `git add lib/quiz/draw.ts lib/quiz/__tests__/draw.test.ts && git commit -m "feat(quiz): random draw with tests"`

### Task 6: Scoring (TDD)

**Files:** Create `lib/quiz/scoring.ts`, `lib/quiz/__tests__/scoring.test.ts`

**Interfaces:**
- Consumes: `AttemptAnswers`, `ScoreResult` (Task 4).
- Produces: `scoreAttempt(assignedIds: string[], answers: AttemptAnswers, keyByQuestionId: Record<string, number>, pointsPerCorrect: number): ScoreResult`. Only `assignedIds` are scored; missing/`null` answers → unanswered; non-matching → wrong; no negative marking.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreAttempt } from "../scoring";

const keys = { q1: 0, q2: 1, q3: 2, q4: 3 };
describe("scoreAttempt", () => {
  it("awards points per correct, no negative marking", () => {
    const r = scoreAttempt(["q1","q2","q3","q4"], { q1: 0, q2: 1, q3: 0, q4: null }, keys, 10);
    expect(r).toEqual({ score: 20, correctCount: 2, wrongCount: 1, unansweredCount: 1 });
  });
  it("treats missing answers as unanswered", () => {
    const r = scoreAttempt(["q1","q2"], {}, keys, 10);
    expect(r).toEqual({ score: 0, correctCount: 0, wrongCount: 0, unansweredCount: 2 });
  });
  it("ignores answers to non-assigned questions", () => {
    const r = scoreAttempt(["q1"], { q1: 0, q2: 1 }, keys, 10);
    expect(r.score).toBe(10);
    expect(r.correctCount + r.wrongCount + r.unansweredCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**

```ts
// lib/quiz/scoring.ts
import type { AttemptAnswers, ScoreResult } from "./types";

export function scoreAttempt(
  assignedIds: string[],
  answers: AttemptAnswers,
  keyByQuestionId: Record<string, number>,
  pointsPerCorrect: number,
): ScoreResult {
  let correct = 0, wrong = 0, unanswered = 0;
  for (const id of assignedIds) {
    const a = answers[id];
    if (a === null || a === undefined) { unanswered++; continue; }
    if (a === keyByQuestionId[id]) correct++; else wrong++;
  }
  return {
    score: correct * pointsPerCorrect,
    correctCount: correct, wrongCount: wrong, unansweredCount: unanswered,
  };
}
```

- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `git add lib/quiz/scoring.ts lib/quiz/__tests__/scoring.test.ts && git commit -m "feat(quiz): scoring with tests"`

### Task 7: CSV parse/validate (TDD)

**Files:** Create `lib/quiz/csv.ts`, `lib/quiz/__tests__/csv.test.ts`

**Interfaces:**
- Produces:
```ts
export type ParsedQuestion = { question: string; options: [string,string,string,string]; correct_index: number; category: string | null };
export type CsvParseResult =
  | { ok: true; rows: ParsedQuestion[] }
  | { ok: false; errors: { line: number; message: string }[] };
export function parseQuestionsCsv(text: string): CsvParseResult;
```
Header required: `question,option_a,option_b,option_c,option_d,correct,category`. `correct` accepts `A`–`D` (case-insensitive) or `0`–`3`. `category` optional. Quoted fields with commas supported.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseQuestionsCsv } from "../csv";

const header = "question,option_a,option_b,option_c,option_d,correct,category";
describe("parseQuestionsCsv", () => {
  it("parses a valid row with letter answer", () => {
    const r = parseQuestionsCsv(`${header}\nCapital of France?,Paris,London,Rome,Berlin,A,GK`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0]).toEqual({
      question: "Capital of France?", options: ["Paris","London","Rome","Berlin"],
      correct_index: 0, category: "GK",
    });
  });
  it("accepts numeric correct and quoted fields with commas", () => {
    const r = parseQuestionsCsv(`${header}\n"a, b?",w,x,y,z,2,`);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows[0].question).toBe("a, b?"); expect(r.rows[0].correct_index).toBe(2); expect(r.rows[0].category).toBeNull(); }
  });
  it("reports errors with line numbers for bad correct values and missing fields", () => {
    const r = parseQuestionsCsv(`${header}\nq,a,b,c,d,Z,\n,a,b,c,d,A,`);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.errors).toHaveLength(2); expect(r.errors[0].line).toBe(2); }
  });
  it("rejects a missing/invalid header", () => {
    expect(parseQuestionsCsv("wrong,header\n1,2").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `parseQuestionsCsv`: split lines (handle `\r\n`); validate header equals the 7 expected columns; parse each data line with a small quoted-CSV splitter; trim fields; require non-empty `prompt` and all 4 options; map `correct` (`A/B/C/D` or `0..3`) to `0..3` else error `Invalid 'correct' (use A–D or 0–3)`; `category` empty → `null`; accumulate `{line, message}` errors (line = file line number, 1-based, header = line 1); return `{ok:true, rows}` only when zero errors.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `git add lib/quiz/csv.ts lib/quiz/__tests__/csv.test.ts && git commit -m "feat(quiz): CSV question parser with tests"`

---

## Phase 3 — Member backend (`amb-primeengage`)

### Task 8: Assign route handler

**Files:** Create `app/api/quiz/assign/route.ts`

**Interfaces:**
- Consumes: `requireAmbassadorForApi()` → `{ ok, ctx: { profileId } }`; `createAdminClient()`; `drawRandom` (Task 5); `QuizViewModel`, `PublicQuestion` (Task 4).
- Produces: `POST /api/quiz/assign` → `200 { viewModel: QuizViewModel }` or `{ dormant: true }` when no active round, or `{ alreadyCompleted: true, score }`. Never returns `correct_index`.

- [ ] **Step 1:** Read `node_modules/next/dist/docs/` route-handler guidance (Next 16). Confirm the `export async function POST(req: Request)` signature and `Response.json` usage match the existing `app/api/admin/.../route.ts` files.
- [ ] **Step 2: Implement** the handler:
  1. `const gate = await requireAmbassadorForApi(); if (!gate.ok) return gate.response;`
  2. `const sb = createAdminClient();`
  3. Load active round: `select id,time_limit_seconds,points_per_correct,questions_per_attempt from yuvaah_quiz_rounds where status='active' maybeSingle()`. If none → `Response.json({ dormant: true })`.
  4. Load existing attempt: `select * from yuvaah_quiz_attempts where round_id=:r and profile_id=:p maybeSingle()`.
     - If `status==='completed'` → `Response.json({ alreadyCompleted: true, score })`.
     - If exists and `in_progress` → reuse its `assigned_question_ids`.
  5. If no attempt: load pool ids `select id from yuvaah_quiz_questions where round_id=:r`; `const assigned = drawRandom(ids.map(x=>x.id), round.questions_per_attempt);` then **insert** the attempt `{ round_id, profile_id, assigned_question_ids: assigned }`. On unique-violation (race) → re-select the existing row and use it (idempotent).
  6. Fetch public questions for `assigned`: `select id,prompt,option_a,option_b,option_c,option_d from yuvaah_quiz_questions where id in (assigned)` — **no `correct_index`**. Re-order to match `assigned` order. Map to `PublicQuestion`.
  7. Return `Response.json({ viewModel: { attemptId, questions, timeLimitSeconds, pointsPerCorrect, startedAtIso } })`.
- [ ] **Step 3: Verify** with `execute_sql` set-up (insert a draft round + 12 questions, activate it) then `curl`/browser POST while logged in as an approved ambassador: confirm 10 questions returned, none containing a correct index, and a second POST returns the same 10.
- [ ] **Step 4:** `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `git add app/api/quiz/assign/route.ts && git commit -m "feat(quiz): assign route — locked random draw"`

### Task 9: Submit route handler

**Files:** Create `app/api/quiz/submit/route.ts`

**Interfaces:**
- Consumes: `requireAmbassadorForApi()`, `createAdminClient()`, `scoreAttempt` (Task 6).
- Produces: `POST /api/quiz/submit` body `{ attemptId: string; answers: AttemptAnswers }` → `200 { score, correctCount, wrongCount, unansweredCount, pointsCredited }`. Idempotent.

- [ ] **Step 1: Implement:**
  1. Gate (ambassador). Parse JSON body; validate `attemptId` is a string and `answers` is an object of `number|null` with values in `0..3` (Zod).
  2. Load attempt by id; verify `attempt.profile_id === gate.ctx.profileId` (else 403). If `status==='completed'` → return its stored result (idempotent no-op).
  3. Load round (`points_per_correct`). Load keys for the assigned ids: `select id,correct_index from yuvaah_quiz_questions where id in (assigned)` → `keyByQuestionId`.
  4. `const result = scoreAttempt(assigned, answers, keyByQuestionId, round.points_per_correct);`
  5. **Credit points + complete, guarding double-credit:** only when `attempt.points_ledger_id` is null and `result.score > 0`, insert one `amb_points_ledger` row `{ user_id: profileId, delta: score, reason: 'quiz_score', reference_id: attemptId }` and capture its id. Then `update yuvaah_quiz_attempts set status='completed', answers, score, correct_count, wrong_count, unanswered_count, completed_at=now(), points_ledger_id=:ledgerId where id=:attemptId and status='in_progress'`. Use the `status='in_progress'` guard in the WHERE so concurrent submits don't double-credit (if 0 rows updated, re-select and return the stored result; delete the just-inserted ledger row to avoid orphan credit).
  6. Return the result + `pointsCredited`.
- [ ] **Step 2: Verify** end-to-end via the assign→submit pair: submit known answers, confirm score math, confirm exactly one `quiz_score` ledger row (`select count(*) from amb_points_ledger where reference_id=:attemptId`), and that a second submit is a no-op (still one ledger row).
- [ ] **Step 3:** `npm run typecheck && npm run lint`.
- [ ] **Step 4: Commit** `git add app/api/quiz/submit/route.ts && git commit -m "feat(quiz): submit route — server scoring + idempotent points credit"`

---

## Phase 4 — Member UI wiring (`amb-primeengage`)

### Task 10: Quiz gate/landing page

**Files:** Create `app/(ambassador)/quiz/page.tsx`

**Interfaces:**
- Consumes: `requireAmbassador()`; reads active round + the member's attempt server-side (service-role) to branch.

- [ ] **Step 1: Implement** a server component: `const ctx = await requireAmbassador();` then with `createAdminClient()` load the active round and the member's attempt for it.
  - No active round → render dormant card ("No active quiz right now. Check back soon.").
  - Completed attempt → render `ResultCard` (read stored score/counts) + "You've already attempted this round."
  - Otherwise → "Start the quiz" CTA linking to `/quiz/play` (and copy of any T&C text). If an `in_progress` attempt exists, the CTA reads "Resume".
- [ ] **Step 2: Verify** typecheck; manually visit `/quiz` in the three states (toggle round status / attempt rows via `execute_sql`).
- [ ] **Step 3: Commit** `git add app/\(ambassador\)/quiz/page.tsx && git commit -m "feat(quiz): member landing/gate"`

### Task 11: Quiz play page + runner wiring

**Files:** Create `app/(ambassador)/quiz/play/page.tsx`; Modify `components/quiz/quiz-runner.tsx` (wire to backend, apply chosen theme from Task 0)

- [ ] **Step 1: Implement** `play/page.tsx` as a thin server component gated by `requireAmbassador()` that renders the client `QuizRunner`. `QuizRunner` on mount POSTs `/api/quiz/assign`; branches on `dormant` / `alreadyCompleted` (redirect to `/quiz`) / `viewModel` (render questions). It persists answers in local state, computes the countdown from `startedAtIso + timeLimitSeconds`, auto-submits on expiry, and on Submit POSTs `/api/quiz/submit` then routes to `/quiz/result?...` (pass result via the landing page re-read, not query secrets).
- [ ] **Step 2:** Use a hard navigation from redirect branches if a soft-nav hang appears (per Next 16 memory).
- [ ] **Step 3: Verify** full manual run on desktop + mobile widths: assign → answer → submit → result; refresh mid-quiz resumes the same 10.
- [ ] **Step 4:** `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `git add app/\(ambassador\)/quiz/play components/quiz/quiz-runner.tsx && git commit -m "feat(quiz): play page wired to assign/submit"`

### Task 12: Result page

**Files:** Create `app/(ambassador)/quiz/result/page.tsx`

- [ ] **Step 1: Implement** a server component gated by `requireAmbassador()` that re-reads the member's completed attempt for the active (or most recent) round and renders `ResultCard` (score, correct/wrong/unanswered, points credited). Correct answers are NOT shown.
- [ ] **Step 2: Verify** typecheck + manual.
- [ ] **Step 3: Commit** `git add app/\(ambassador\)/quiz/result && git commit -m "feat(quiz): result page"`

---

## Phase 5 — Admin panel (`amb-primeengage`)

> Mirror the activities CRUD pattern. Reference files (read before writing): `app/(admin)/admin/activities/page.tsx` (list), `app/(admin)/admin/activities/[id]/page.tsx` (detail+edit), `components/admin/activity-form.tsx` (form), `app/actions/activities.ts` (actions), `components/admin/table.tsx` (PageHeading/TableShell/Th/Td/Badge). Auth gate: `requireAdmin()`.

### Task 13: Admin quiz actions + rounds CRUD + nav

**Files:** Create `app/actions/quizzes.ts`, `app/(admin)/admin/quizzes/page.tsx`, `app/(admin)/admin/quizzes/new/page.tsx`, `app/(admin)/admin/quizzes/[id]/page.tsx`, `components/admin/quiz-form.tsx`; Modify the admin sidebar nav to add a "Quizzes" link.

**Interfaces:**
- Produces server actions: `createRound`, `updateRound` (draft-only), `activateRound`, `deactivateRound`. Each calls `requireAdmin()` first, uses `createAdminClient()`, `revalidatePath`.

- [ ] **Step 1: Implement `app/actions/quizzes.ts`** following `activities.ts` shape. Fields parsed: `title` (req, ≤200), `description` (optional), `time_limit_seconds` (optional int ≥0, blank→null), `points_per_correct` (int ≥0, default 10), `questions_per_attempt` (int >0, default 10).
  - `updateRound`: reject if the round's `status !== 'draft'` → `{ ok:false, error:"Only draft rounds can be edited." }`.
  - `activateRound(id)`: verify `status='draft'`; ensure pool size ≥ `questions_per_attempt` (else error); set `status='active', activated_at=now()`. If insert/update hits the single-active unique index → `{ ok:false, error:"Another round is already active. Deactivate it first." }`.
  - `deactivateRound(id)`: set `status='closed', closed_at=now()` (only from `active`).
- [ ] **Step 2: Implement the list page** (`/admin/quizzes`): table of rounds with status badge, pool size (count query), participant count (`yuvaah_quiz_attempts` count), and a "New quiz" button. Mirror `activities/page.tsx`.
- [ ] **Step 3: Implement `new` + `[id]` pages + `QuizForm`** mirroring `activities/new` + `[id]` + `ActivityForm`. The `[id]` detail page shows the form (disabled when not `draft`), an Activate/Deactivate button (bound to the actions), and links to "Manage questions" and "Responses".
- [ ] **Step 4: Add the "Quizzes" nav link** in the admin sidebar (same file/component the existing Activities/Events links live in).
- [ ] **Step 5: Verify** typecheck + lint; manually create a draft round, edit it, try activating with too few questions (blocked), add questions (Task 14) then activate, confirm a second active round is rejected.
- [ ] **Step 6: Commit** `git add app/actions/quizzes.ts app/\(admin\)/admin/quizzes/page.tsx app/\(admin\)/admin/quizzes/new app/\(admin\)/admin/quizzes/\[id\]/page.tsx components/admin/quiz-form.tsx app/\(admin\)/admin/layout.tsx && git commit -m "feat(admin): quiz rounds CRUD + activation"`

### Task 14: Question pool management + CSV upload

**Files:** Create `app/(admin)/admin/quizzes/[id]/questions/page.tsx`, `components/admin/question-form.tsx`, `components/admin/quiz-csv-upload.tsx`; add question actions to `app/actions/quizzes.ts`.

**Interfaces:**
- Produces actions: `addQuestion`, `updateQuestion`, `deleteQuestion`, `uploadQuestionsCsv` (all `requireAdmin()`; reject if the round is not `draft`).

- [ ] **Step 1: Implement actions.** `addQuestion`/`updateQuestion` parse `prompt`, `option_a..d`, `correct_index` (0..3), `category`; insert/update `yuvaah_quiz_questions`. `deleteQuestion(id)` deletes by id. `uploadQuestionsCsv(roundId, formData)`: read the uploaded file text, call `parseQuestionsCsv` (Task 7); on `ok:false` return `{ ok:false, errors }`; on success bulk-insert all rows; return `{ ok:true, inserted }`. All reject when round `status !== 'draft'`.
- [ ] **Step 2: Implement the questions page**: list current pool (prompt, category, correct option highlighted — admin view only), a `QuestionForm` (manual add/edit), a `QuizCsvUpload` client component (file input + "Download template" link emitting the header row + a sample line, plus inline display of per-line errors returned by the action). Show a banner if pool size < `questions_per_attempt`, and a notice that the pool locks on activation.
- [ ] **Step 3: Verify** typecheck + lint; upload a valid CSV (rows inserted), upload an invalid CSV (per-line errors shown, nothing inserted), manual add/edit/delete, and confirm editing is blocked once the round is active.
- [ ] **Step 4: Commit** `git add app/\(admin\)/admin/quizzes/\[id\]/questions components/admin/question-form.tsx components/admin/quiz-csv-upload.tsx app/actions/quizzes.ts && git commit -m "feat(admin): question pool + CSV upload"`

### Task 15: Responses view

**Files:** Create `app/(admin)/admin/quizzes/[id]/responses/page.tsx`

- [ ] **Step 1: Implement** a server component (`requireAdmin()`): list attempts for the round joined to `amb_profiles` (name) — columns: participant, status, score, correct/wrong/unanswered, submitted time. A detail expander (or `[attemptId]` sub-route) renders each assigned question, the member's chosen option, and the correct option (admin-only, via service role).
- [ ] **Step 2: Verify** typecheck + lint; after a member completes a quiz, confirm the row + answer detail render correctly.
- [ ] **Step 3: Commit** `git add app/\(admin\)/admin/quizzes/\[id\]/responses && git commit -m "feat(admin): quiz responses view"`

---

## Phase 6 — CTA on the marketing site (`primeengage`)

### Task 16: "Take the Quiz" CTA + cleanup

**Files:** Modify `primeengage/app/(site)/yuvaah-club/page.tsx`, `primeengage/.env` (+ env example); Delete `amb-primeengage/app/(ambassador)/quiz/preview/page.tsx`

- [ ] **Step 1:** Add `NEXT_PUBLIC_DASHBOARD_URL` to `primeengage` env (the deployed `amb-primeengage` base URL) and document it in the env example file.
- [ ] **Step 2:** Add a "Take the Quiz" CTA section on the `/yuvaah-club` page (reuse the existing `Button`/`Section`/`Container` components, brand styling) linking to `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/quiz`. Always visible (lands on the dormant screen when no round is active). Read `node_modules/next/dist/docs/` if any new Next API is touched.
- [ ] **Step 3:** Delete the temporary `quiz/preview` harness from Task 0.
- [ ] **Step 4: Verify** typecheck/lint in both repos; manually click through from `/yuvaah-club` → dashboard `/quiz`.
- [ ] **Step 5: Commit** (two repos):

```bash
# primeengage
git add app/\(site\)/yuvaah-club/page.tsx .env*  && git commit -m "feat(yuvaah-club): Take the Quiz CTA"
# amb-primeengage
git add -A && git commit -m "chore(quiz): remove preview harness"
```

---

## Phase 7 — End-to-end verification

### Task 17: Full-flow verification

- [ ] **Step 1:** Admin: create round → CSV-upload 12+ questions → activate (single-active enforced).
- [ ] **Step 2:** Member: from `/yuvaah-club` CTA → `/quiz` → start → answer 10 → submit → result shows correct score; refresh mid-quiz resumes same 10; second visit shows "already attempted".
- [ ] **Step 3:** Verify points: exactly one `quiz_score` ledger row per attempt; member's balance, leaderboard `total_earned`, and `amb_user_tier` all reflect the score (`execute_sql`).
- [ ] **Step 4:** Admin: responses view shows the member's answers vs correct; deactivate → `/quiz` returns to dormant.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npx vitest run lib/quiz` (all green). No full suite run.

---

## Self-Review notes (author)

- **Spec coverage:** dormant default (Task 10/16), activate/deactivate (Task 13), one attempt/round (Task 1 unique + Task 8/9 guards), random 10 locked (Task 5/8), 10 pts/100 max (Task 1 defaults + Task 6), CSV upload + manual edit (Task 14), responses (Task 15), points→ledger+leaderboard+tier (Task 1/9), no proctoring (omitted by design), any device (Task 0 responsive), optional timer (Task 0/11), correct answers hidden from members (Task 12). ✓
- **Open confirmation carried from spec:** quiz points counting toward leaderboard/tier (Task 1 Steps 1–2). If the client wants spendable-only, drop the leaderboard/tier edits.
- **No placeholders:** pure-logic tasks carry full code+tests; admin CRUD tasks reference exact existing pattern files to mirror (justified in an existing codebase with a strong established pattern) and enumerate the exact fields/rules that differ.

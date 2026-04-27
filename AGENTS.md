<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This repo runs **Next 16.2.4** (matched to the sibling `primeengage` repo).
APIs, conventions, and file structure differ from earlier Next versions —
including breaking changes likely to be in your training data.

**Read the relevant guide in `node_modules/next/dist/docs/` before writing
any code that touches:**

- middleware / proxy (`middleware.ts` is deprecated → use `proxy.ts` with
  `function proxy()`; codemod: `npx @next/codemod@canary middleware-to-proxy .`)
- server actions / route handlers / layouts / route groups
- dynamic APIs (`cookies()`, `headers()`, `searchParams` are async — must
  `await`)
- `next.config.ts`

Heed deprecation notices in the docs. When in doubt, grep
`node_modules/next/dist/docs/` first.

**Cache hygiene on Windows:** Turbopack stores its build cache in
`.next/dev/cache/turbopack/*.sst`. **Never delete `.next/` while a dev
server is running** — Turbopack's writer panics on missing files and the
running server starts returning empty 500s and "Cannot find module" errors
on every request. If a dev server falls back from port 3000 to 3001, that
means another `node.exe` from a previous session is still alive — kill it
via Task Manager BEFORE deleting `.next/` or starting a new one. Pattern:
(1) Ctrl+C the dev server, (2) confirm no `node.exe` lingers, (3) delete
`.next/`, (4) `npm run dev`.
<!-- END:nextjs-agent-rules -->

## Companion repo

The marketing site + applicant flow lives in the sibling repo `primeengage`
(at `../primeengage/` on the developer's machine). The two repos share the
same Supabase project (`zpciertrkqwzuuektzpj`) and a byte-identical
`lib/ambassador/types.ts`. Cross-reference primeengage when:

- you need the canonical brand tokens (its `app/globals.css` is the source
  of truth for the design system)
- you need the canonical SMTP / email pattern (its `lib/mailer.ts`)
- you're adding a new option / field to the application form (change
  primeengage first, then re-copy `lib/ambassador/types.ts` here verbatim)

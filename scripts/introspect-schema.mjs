/**
 * Introspect the live Supabase project's `amb_*` namespace via the Management
 * API and dump:
 *   - docs/database-schema.md   (human-readable snapshot)
 *   - scripts/.schema-cache.json (raw rows, used by generate-types.mjs)
 *
 * Run: `node scripts/introspect-schema.mjs`
 *
 * Requires .env.local with SUPABASE_TOKEN and SUPABASE_URL set.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
loadEnv({ path: resolve(ROOT, ".env.local") });

const TOKEN = process.env.SUPABASE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
if (!TOKEN || !SUPABASE_URL) {
  console.error("Missing SUPABASE_TOKEN or SUPABASE_URL in .env.local");
  process.exit(1);
}

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

async function runQuery(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Query failed (${res.status}): ${body}`);
  }
  return res.json();
}

const SQL_TABLES = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name LIKE 'amb\\_%' ESCAPE '\\'
  ORDER BY table_name;
`;

const SQL_COLUMNS = `
  SELECT
    table_name,
    column_name,
    ordinal_position,
    data_type,
    udt_name,
    is_nullable,
    column_default,
    character_maximum_length
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name LIKE 'amb\\_%' ESCAPE '\\'
  ORDER BY table_name, ordinal_position;
`;

const SQL_INDEXES = `
  SELECT
    schemaname, tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename LIKE 'amb\\_%' ESCAPE '\\'
  ORDER BY tablename, indexname;
`;

// pg_constraint surfaces cross-schema FKs (information_schema does not).
const SQL_CONSTRAINTS = `
  SELECT
    conrel.relname  AS table_name,
    c.conname       AS constraint_name,
    CASE c.contype
      WHEN 'p' THEN 'PRIMARY KEY'
      WHEN 'f' THEN 'FOREIGN KEY'
      WHEN 'u' THEN 'UNIQUE'
      WHEN 'c' THEN 'CHECK'
      WHEN 'x' THEN 'EXCLUSION'
    END             AS constraint_type,
    pg_get_constraintdef(c.oid) AS definition,
    forns.nspname   AS foreign_schema,
    forrel.relname  AS foreign_table
  FROM pg_constraint c
  JOIN pg_class      conrel ON c.conrelid     = conrel.oid
  JOIN pg_namespace  conns  ON conrel.relnamespace = conns.oid
  LEFT JOIN pg_class      forrel ON c.confrelid     = forrel.oid
  LEFT JOIN pg_namespace  forns  ON forrel.relnamespace = forns.oid
  WHERE conns.nspname = 'public'
    AND conrel.relname LIKE 'amb\\_%' ESCAPE '\\'
  ORDER BY conrel.relname, c.contype, c.conname;
`;

const SQL_VIEWS = `
  SELECT table_name AS view_name, view_definition
  FROM information_schema.views
  WHERE table_schema = 'public'
    AND table_name LIKE 'amb\\_%' ESCAPE '\\'
  ORDER BY table_name;
`;

const SQL_BUCKETS = `
  SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
  FROM storage.buckets
  WHERE name LIKE 'amb\\_%' ESCAPE '\\'
  ORDER BY name;
`;

const SQL_RLS = `
  SELECT relname AS table_name, relrowsecurity AS rls_enabled
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname LIKE 'amb\\_%' ESCAPE '\\'
    AND relkind = 'r'
  ORDER BY relname;
`;

const SQL_POLICIES = `
  SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename LIKE 'amb\\_%' ESCAPE '\\'
  ORDER BY tablename, policyname;
`;

function md(rows, headers) {
  if (rows.length === 0) return "_(none)_\n";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (r) =>
        `| ${headers.map((h) => String(r[h] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`,
    )
    .join("\n");
  return `${head}\n${sep}\n${body}\n`;
}

(async () => {
  console.log(`→ Project ref: ${PROJECT_REF}`);
  console.log("→ Querying live schema...");

  const [tables, columns, indexes, constraints, views, buckets, rls, policies] =
    await Promise.all([
      runQuery(SQL_TABLES),
      runQuery(SQL_COLUMNS),
      runQuery(SQL_INDEXES),
      runQuery(SQL_CONSTRAINTS),
      runQuery(SQL_VIEWS),
      runQuery(SQL_BUCKETS),
      runQuery(SQL_RLS),
      runQuery(SQL_POLICIES),
    ]);

  const cache = {
    project_ref: PROJECT_REF,
    introspected_at: new Date().toISOString(),
    tables,
    columns,
    indexes,
    constraints,
    views,
    buckets,
    rls,
    policies,
  };

  mkdirSync(resolve(ROOT, "scripts"), { recursive: true });
  writeFileSync(
    resolve(ROOT, "scripts/.schema-cache.json"),
    JSON.stringify(cache, null, 2),
  );

  // Group columns by table for the markdown render.
  const colsByTable = {};
  for (const c of columns) {
    (colsByTable[c.table_name] ||= []).push(c);
  }
  const idxByTable = {};
  for (const i of indexes) {
    (idxByTable[i.tablename] ||= []).push(i);
  }
  const consByTable = {};
  for (const c of constraints) {
    (consByTable[c.table_name] ||= []).push(c);
  }
  const polByTable = {};
  for (const p of policies) {
    (polByTable[p.tablename] ||= []).push(p);
  }
  const rlsByTable = Object.fromEntries(
    rls.map((r) => [r.table_name, r.rls_enabled]),
  );

  let out = "";
  out += `# Database Schema (live snapshot)\n\n`;
  out += `> Source: Supabase project \`${PROJECT_REF}\`. Generated by \`scripts/introspect-schema.mjs\` at ${cache.introspected_at}.\n`;
  out += `> Do **not** hand-edit this file. Re-run \`npm run supabase:introspect\` after schema changes.\n\n`;
  out += `Scope: every \`amb_*\` table, view, storage bucket, RLS policy, and index in the \`public\` schema.\n\n`;

  out += `## Tables\n\n`;
  if (tables.length === 0) {
    out += `_No \`amb_*\` tables found in \`public\`._\n\n`;
  } else {
    out += tables.map((t) => `- [\`${t.table_name}\`](#${t.table_name})`).join("\n") + "\n\n";
    for (const t of tables) {
      const name = t.table_name;
      out += `### \`${name}\`\n\n`;
      out += `**RLS enabled:** ${rlsByTable[name] ? "yes" : "**NO**"}\n\n`;
      out += `**Columns**\n\n`;
      out += md(
        (colsByTable[name] || []).map((c) => ({
          "#": c.ordinal_position,
          column: c.column_name,
          type: c.udt_name,
          nullable: c.is_nullable,
          default: c.column_default,
        })),
        ["#", "column", "type", "nullable", "default"],
      );
      out += `\n**Constraints**\n\n`;
      out += md(
        (consByTable[name] || []).map((c) => ({
          name: c.constraint_name,
          type: c.constraint_type,
          definition: c.definition,
        })),
        ["name", "type", "definition"],
      );
      out += `\n**Indexes**\n\n`;
      out += md(
        (idxByTable[name] || []).map((i) => ({
          name: i.indexname,
          definition: i.indexdef,
        })),
        ["name", "definition"],
      );
      out += `\n**RLS Policies**\n\n`;
      out += md(
        (polByTable[name] || []).map((p) => ({
          name: p.policyname,
          cmd: p.cmd,
          roles: Array.isArray(p.roles) ? p.roles.join(", ") : p.roles,
          qual: p.qual,
          with_check: p.with_check,
        })),
        ["name", "cmd", "roles", "qual", "with_check"],
      );
      out += `\n`;
    }
  }

  out += `## Views\n\n`;
  if (views.length === 0) {
    out += `_No \`amb_*\` views found._\n\n`;
  } else {
    for (const v of views) {
      out += `### \`${v.view_name}\`\n\n`;
      out += "```sql\n";
      out += `${v.view_definition.trim()}\n`;
      out += "```\n\n";
    }
  }

  out += `## Storage Buckets (\`amb_*\`)\n\n`;
  out += md(
    buckets.map((b) => ({
      name: b.name,
      public: b.public,
      size_limit_bytes: b.file_size_limit,
      allowed_mime: Array.isArray(b.allowed_mime_types)
        ? b.allowed_mime_types.join(", ")
        : b.allowed_mime_types,
      created_at: b.created_at,
    })),
    ["name", "public", "size_limit_bytes", "allowed_mime", "created_at"],
  );

  // Mechanical gaps the schema dump should call out at the top of any review.
  const findings = [];
  const ambTableNames = tables.map((t) => t.table_name);
  for (const t of ambTableNames) {
    const enabled = rlsByTable[t];
    const polCount = (polByTable[t] || []).length;
    if (enabled && polCount === 0) {
      findings.push(
        `\`${t}\`: **RLS is enabled but there are 0 policies** — the table is therefore unreadable by \`anon\` and \`authenticated\` roles. Reads currently work only via the service-role key (RLS bypass). Add SELECT policies before the admin UI relies on session-scoped queries, or accept that the admin UI must use the service-role client.`,
      );
    }
  }
  const ambColMap = Object.fromEntries(
    Object.entries(colsByTable).map(([t, cs]) => [t, new Set(cs.map((c) => c.column_name))]),
  );
  if (ambColMap.amb_profiles && !ambColMap.amb_profiles.has("rejected_at")) {
    findings.push(
      "`amb_profiles`: missing `rejected_at timestamptz NULL`. Required for the reject flow per Q4. Apply via `ALTER TABLE public.amb_profiles ADD COLUMN IF NOT EXISTS rejected_at timestamptz;` and mirror into `primeengage/supabase/schema.sql` + the tech doc §4.1.",
    );
  }
  for (const b of buckets) {
    if (b.file_size_limit === null) {
      findings.push(
        `Bucket \`${b.name}\`: no \`file_size_limit\` set at the bucket level. Tech doc §7 caps Student ID at 5 MB — currently enforced application-side only. Acceptable for Phase 1; revisit before public scale.`,
      );
    }
    if (b.allowed_mime_types === null && b.name === "amb_applications") {
      findings.push(
        `Bucket \`${b.name}\`: no \`allowed_mime_types\` set at the bucket level. Allowed types (\`image/jpeg\`, \`image/png\`, \`image/webp\`, \`application/pdf\`) are enforced application-side only.`,
      );
    }
  }

  out += `\n## Findings & Gaps (auto-generated)\n\n`;
  if (findings.length === 0) {
    out += "_No mechanical gaps detected._\n";
  } else {
    out += findings.map((f) => `- ${f}`).join("\n") + "\n";
  }

  mkdirSync(resolve(ROOT, "docs"), { recursive: true });
  writeFileSync(resolve(ROOT, "docs/database-schema.md"), out);

  console.log(`✓ Wrote scripts/.schema-cache.json`);
  console.log(`✓ Wrote docs/database-schema.md`);
  console.log(`  Tables: ${tables.length}, Views: ${views.length}, Buckets: ${buckets.length}, Policies: ${policies.length}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

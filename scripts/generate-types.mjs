/**
 * Reads scripts/.schema-cache.json (produced by introspect-schema.mjs) and
 * emits lib/supabase/database.types.ts.
 *
 * Run: `node scripts/generate-types.mjs`
 *
 * Coverage: every `amb_*` table + view in `public`. Row / Insert / Update
 * shapes match Supabase JS conventions so `createClient<Database>()` gives
 * full inference on .from('amb_profiles')…
 *
 * For Phase 1 this is intentionally simple — we hand-rolled it instead of
 * pulling in `supabase gen types` because the CLI has its own auth/dependency
 * chain and we only need the amb_* surface. Revisit when scope grows.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const cache = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/.schema-cache.json"), "utf8"),
);

/** Postgres udt_name → TS type. Conservative; widen as we encounter new types. */
function pgToTs(udt, isNullable) {
  let base;
  switch (udt) {
    case "uuid":
    case "text":
    case "varchar":
    case "bpchar":
    case "citext":
      base = "string";
      break;
    case "int2":
    case "int4":
    case "int8":
    case "float4":
    case "float8":
    case "numeric":
      base = "number";
      break;
    case "bool":
      base = "boolean";
      break;
    case "json":
    case "jsonb":
      base = "Json";
      break;
    case "timestamp":
    case "timestamptz":
    case "date":
    case "time":
    case "timetz":
      base = "string"; // ISO string round-trips through JSON
      break;
    case "_text":
      base = "string[]";
      break;
    default:
      base = "unknown";
  }
  return isNullable === "YES" ? `${base} | null` : base;
}

function tableType(table, columns) {
  const rows = columns
    .map((c) => `          ${c.column_name}: ${pgToTs(c.udt_name, c.is_nullable)};`)
    .join("\n");

  // Insert: nullable cols + cols with defaults are optional.
  const inserts = columns
    .map((c) => {
      const optional = c.is_nullable === "YES" || c.column_default !== null;
      return `          ${c.column_name}${optional ? "?" : ""}: ${pgToTs(c.udt_name, c.is_nullable)};`;
    })
    .join("\n");

  // Update: everything optional.
  const updates = columns
    .map(
      (c) =>
        `          ${c.column_name}?: ${pgToTs(c.udt_name, c.is_nullable)};`,
    )
    .join("\n");

  return `      ${table}: {
        Row: {
${rows}
        };
        Insert: {
${inserts}
        };
        Update: {
${updates}
        };
        Relationships: [];
      };`;
}

const colsByTable = {};
for (const c of cache.columns) {
  (colsByTable[c.table_name] ||= []).push(c);
}

// Split into tables vs views.
const viewNames = new Set(cache.views.map((v) => v.view_name));
const tableNames = cache.tables.map((t) => t.table_name);

const tablesBlock = tableNames
  .filter((t) => !viewNames.has(t))
  .map((t) => tableType(t, colsByTable[t] || []))
  .join("\n");

const viewsBlock = [...viewNames]
  .map((v) => {
    const cols = (colsByTable[v] || [])
      .map((c) => `          ${c.column_name}: ${pgToTs(c.udt_name, c.is_nullable)};`)
      .join("\n");
    return `      ${v}: {
        Row: {
${cols}
        };
        Relationships: [];
      };`;
  })
  .join("\n");

const out = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: live Supabase project ${cache.project_ref}
 * Generated: ${new Date().toISOString()}
 * Generator: scripts/generate-types.mjs (after scripts/introspect-schema.mjs)
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
${tablesBlock || "      [_: string]: never;"}
    };
    Views: {
${viewsBlock || "      [_: string]: never;"}
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
`;

mkdirSync(resolve(ROOT, "lib/supabase"), { recursive: true });
writeFileSync(resolve(ROOT, "lib/supabase/database.types.ts"), out);
console.log(`✓ Wrote lib/supabase/database.types.ts`);
console.log(
  `  Tables: ${tableNames.filter((t) => !viewNames.has(t)).length}, Views: ${viewNames.size}`,
);

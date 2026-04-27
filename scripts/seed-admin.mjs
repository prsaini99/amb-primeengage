/**
 * One-shot admin seed. Creates the platform's single admin account end-to-end
 * via the Supabase Auth Admin API + service-role client. No Dashboard access
 * required.
 *
 * Run: `npm run seed:admin`  (or `node scripts/seed-admin.mjs`)
 *
 * What it does
 *  1. Loads SUPABASE_URL + SUPABASE_SECRET_KEY from .env.local.
 *  2. Generates a strong 16-char base64url password.
 *  3. Pre-checks for an existing admin (auth.users by email + amb_profiles
 *     by email). Exits cleanly if either exists — never produces duplicates.
 *  4. Creates the auth user with email_confirm: true and
 *     app_metadata.role: 'admin' (read by proxy.ts, no DB hit per request).
 *  5. Inserts the matching amb_profiles row with role='admin',
 *     status='approved', auth_user_id linked.
 *  6. Prints the credentials block and exits.
 *
 * Idempotency
 *  Aborts (exit 0) without changes if the admin email is already present in
 *  EITHER auth.users OR amb_profiles. To re-seed: delete from both first.
 *
 * Output is one-time. Save the credentials before closing the terminal —
 * the password is not stored anywhere else.
 */
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local — aborting.",
  );
  process.exit(1);
}

const ADMIN_EMAIL = "test1@stackbinary.io";
const ADMIN_FIRST = "Admin";
const ADMIN_LAST = "User";
const ADMIN_PHONE_PLACEHOLDER = "0000000000";
const ADMIN_COLLEGE_PLACEHOLDER = "Prime Engage";
const ADMIN_CITY_PLACEHOLDER = "Mumbai";

/** 16-char base64url ≈ 96 bits of entropy. */
function generatePassword() {
  return randomBytes(12)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function preflightExistingAuthUser() {
  // listUsers is paginated; for a single-admin lookup the first page is enough
  // unless the project already has thousands of users (it doesn't — this is a
  // fresh project with applicants only).
  // TODO: paginate if applicants > 200
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL) ?? null;
}

async function preflightExistingProfile() {
  const { data, error } = await sb
    .from("amb_profiles")
    .select("id, role, status, auth_user_id")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  if (error)
    throw new Error(`amb_profiles preflight failed: ${error.message}`);
  return data;
}

(async () => {
  console.log(`→ Seeding admin: ${ADMIN_EMAIL}`);
  console.log("→ Pre-flight: checking for existing rows...");

  const existingUser = await preflightExistingAuthUser();
  const existingProfile = await preflightExistingProfile();

  if (existingUser || existingProfile) {
    console.error("");
    console.error("✗ Admin already seeded — aborting to avoid duplicates.");
    if (existingUser) {
      console.error(
        `  auth.users row exists      → id=${existingUser.id}, created_at=${existingUser.created_at}`,
      );
    }
    if (existingProfile) {
      console.error(
        `  amb_profiles row exists    → id=${existingProfile.id}, role=${existingProfile.role}, status=${existingProfile.status}`,
      );
    }
    console.error("");
    console.error(
      "  To re-seed: delete from both auth.users and amb_profiles first.",
    );
    console.error(
      "  (Safe SQL: DELETE FROM public.amb_profiles WHERE email='" +
        ADMIN_EMAIL +
        "'; then auth.users via auth.admin.deleteUser.)",
    );
    process.exit(1);
  }

  const password = generatePassword();

  console.log("→ Creating auth user with app_metadata.role='admin'...");
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { name: `${ADMIN_FIRST} ${ADMIN_LAST}` },
  });
  if (createErr || !created?.user) {
    console.error(
      `✗ auth.admin.createUser failed: ${createErr?.message ?? "no user returned"}`,
    );
    process.exit(1);
  }
  const authUserId = created.user.id;
  console.log(`  ✓ auth.users.id = ${authUserId}`);

  console.log("→ Inserting amb_profiles row...");
  const { data: profile, error: insertErr } = await sb
    .from("amb_profiles")
    .insert({
      auth_user_id: authUserId,
      role: "admin",
      status: "approved",
      first_name: ADMIN_FIRST,
      last_name: ADMIN_LAST,
      email: ADMIN_EMAIL,
      phone: ADMIN_PHONE_PLACEHOLDER,
      college: ADMIN_COLLEGE_PLACEHOLDER,
      city: ADMIN_CITY_PLACEHOLDER,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !profile?.id) {
    // Rollback the auth user to keep the two sides in sync.
    console.error(
      `✗ amb_profiles insert failed: ${insertErr?.message ?? "no row returned"}`,
    );
    console.error(
      "  Rolling back: deleting the auth user we just created so you can re-run.",
    );
    await sb.auth.admin.deleteUser(authUserId);
    process.exit(1);
  }
  console.log(`  ✓ amb_profiles.id = ${profile.id}`);

  // Final printable block — must be visually distinct from log noise above.
  console.log("");
  console.log("=================================================");
  console.log("  ADMIN CREDENTIALS — SAVE NOW (one-time output)");
  console.log("=================================================");
  console.log(`  Email:           ${ADMIN_EMAIL}`);
  console.log(`  Password:        ${password}`);
  console.log(`  Auth user UUID:  ${authUserId}`);
  console.log(`  amb_profiles.id: ${profile.id}`);
  console.log("=================================================");
  console.log("");
  console.log(
    "  This password is not stored anywhere else. Save it to your secrets",
  );
  console.log(
    "  manager before closing this terminal. To rotate later, sign in once",
  );
  console.log(
    "  and use Supabase's password-reset email or run a small script that",
  );
  console.log("  calls supabase.auth.admin.updateUserById().");
  console.log("");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

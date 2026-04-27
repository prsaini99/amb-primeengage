import Link from "next/link";
import { ArrowRight, Crown, Star, Trophy } from "lucide-react";

import { fmtDate } from "@/components/admin/table";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · Ambassador" };

const LEADERBOARD_TOP_N = 3;
const RECENT_ACTIVITY_LIMIT = 6;

export default async function DashboardHome() {
  const { profileId, profile } = await requireAmbassador();
  const sb = createAdminClient();

  // All five aggregates in parallel.
  const [balanceRes, totalEarnedRes, submissionsRes, activitiesRes, leaderboardRes, recentLedgerRes] =
    await Promise.all([
      sb.from("amb_v_user_balances").select("balance").eq("user_id", profileId).maybeSingle(),
      // Total earned = submission_awarded + award_adjustment. Award
      // adjustments are admin corrections to a previously-awarded amount
      // and DO count as earned. Refunds (admin_adjustment from cancel) and
      // future admin gifts (admin_adjustment) are excluded.
      // See migrations 0010 + 0011.
      sb
        .from("amb_points_ledger")
        .select("delta")
        .eq("user_id", profileId)
        .in("reason", ["submission_awarded", "award_adjustment"]),
      sb.from("amb_submissions").select("status", { count: "exact", head: false }).eq("user_id", profileId),
      sb.from("amb_activities").select("id", { count: "exact", head: true }).eq("is_active", true),
      sb.from("amb_v_leaderboard").select("user_id, first_name, last_name, total_earned").limit(LEADERBOARD_TOP_N),
      sb
        .from("amb_points_ledger")
        .select("id, delta, reason, reference_id, note, created_at")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
        .limit(RECENT_ACTIVITY_LIMIT),
    ]);

  const balance = balanceRes.data?.balance ?? 0;
  const totalEarned =
    totalEarnedRes.data?.reduce((sum, row) => sum + (row.delta ?? 0), 0) ?? 0;
  const submissionStatuses = submissionsRes.data ?? [];
  const totalSubmissions = submissionStatuses.length;
  const awardedSubmissions = submissionStatuses.filter((s) => s.status === "awarded").length;
  const openActivitiesCount = activitiesRes.count ?? 0;
  const leaderboard = leaderboardRes.data ?? [];
  const recentLedger = recentLedgerRes.data ?? [];

  // Resolve activity titles for ledger rows whose reference_id points at a
  // submission. One round-trip to fetch all referenced submissions, then
  // their activities.
  const subRefIds = recentLedger
    .filter((l) => l.reason === "submission_awarded" && l.reference_id)
    .map((l) => l.reference_id!) as string[];
  const refTitles = await resolveSubmissionTitles(sb, subRefIds);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Welcome back, {profile.first_name}
        </h1>
        <p className="text-[14px] text-mute mt-1">
          Here's where you stand. Open activities are your fastest path to more
          points.
        </p>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current balance" value={String(balance)} tint="amber" />
        <StatCard label="Total earned" value={String(totalEarned)} tint="cyan" />
        <StatCard
          label="Submissions"
          value={`${awardedSubmissions} / ${totalSubmissions}`}
          hint="awarded / total"
        />
        <StatCard
          label="Open activities"
          value={String(openActivitiesCount)}
          hint="ready to take on"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity (left, larger) */}
        <section className="lg:col-span-2 rounded-2xl bg-paper-2 ring-1 ring-line p-6">
          <div className="flex items-end justify-between mb-5">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
              Recent points
            </h2>
            <Link
              href="/dashboard/activities"
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
            >
              Browse activities <ArrowRight size={13} />
            </Link>
          </div>

          {recentLedger.length === 0 && (
            <p className="text-[13.5px] text-mute py-4">
              You haven't earned any points yet. Submit an activity to get started.
            </p>
          )}

          {recentLedger.length > 0 && (
            <ul className="divide-y divide-line">
              {recentLedger.map((entry) => {
                const positive = entry.delta > 0;
                const title =
                  entry.reason === "submission_awarded" && entry.reference_id
                    ? refTitles[entry.reference_id] ?? "Submission award"
                    : entry.reason === "award_adjustment"
                      ? entry.note ?? "Award adjusted"
                      : entry.reason === "admin_adjustment"
                        ? entry.note ?? "Admin adjustment"
                        : entry.reason === "order_redemption"
                          ? "Reward redemption"
                          : entry.reason;
                return (
                  <li
                    key={entry.id}
                    className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div
                      className={
                        "h-9 w-9 rounded-full grid place-items-center shrink-0 " +
                        (positive
                          ? "bg-cyan-50 text-navy-800 ring-1 ring-cyan-300/60"
                          : "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/30")
                      }
                    >
                      <Star size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-navy-900 truncate">
                        {title}
                      </div>
                      <div className="text-[11.5px] text-mute">
                        {fmtDate(entry.created_at)}
                      </div>
                    </div>
                    <div
                      className={
                        "font-mono text-[13.5px] font-semibold shrink-0 " +
                        (positive ? "text-navy-900" : "text-amber-500")
                      }
                    >
                      {positive ? "+" : ""}
                      {entry.delta}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Leaderboard (right) */}
        <aside className="rounded-2xl bg-paper-2 ring-1 ring-line p-6">
          <div className="flex items-center gap-2 mb-5">
            <Trophy size={14} className="text-amber-500" />
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
              Top {LEADERBOARD_TOP_N}
            </h2>
          </div>

          {leaderboard.length === 0 && (
            <p className="text-[13.5px] text-mute">
              No points awarded yet. Be the first.
            </p>
          )}

          {leaderboard.length > 0 && (
            <ol className="space-y-3">
              {leaderboard.map((row, i) => {
                const isYou = row.user_id === profileId;
                return (
                  <li
                    key={row.user_id}
                    className={
                      "flex items-center gap-3 rounded-xl p-3 " +
                      (isYou
                        ? "bg-amber-500/10 ring-1 ring-amber-500/30"
                        : "bg-paper")
                    }
                  >
                    <div className="w-6 text-center">
                      {i === 0 ? (
                        <Crown size={16} className="text-amber-500 mx-auto" />
                      ) : (
                        <span className="text-[12.5px] font-mono text-mute">
                          {i + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-navy-900 truncate">
                        {row.first_name} {row.last_name}
                        {isYou && (
                          <span className="ml-2 text-[10.5px] uppercase tracking-wider text-amber-500">
                            you
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="font-mono text-[13.5px] font-semibold text-navy-900">
                      {row.total_earned}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tint,
}: {
  label: string;
  value: string;
  hint?: string;
  tint?: "cyan" | "amber" | "navy";
}) {
  const bar = tint
    ? { cyan: "bg-cyan-500", amber: "bg-amber-500", navy: "bg-navy-800" }[tint]
    : "bg-line-strong";
  return (
    <div className="relative rounded-2xl bg-paper-2 ring-1 ring-line p-5 overflow-hidden">
      <div className={`absolute left-0 top-5 bottom-5 w-1 rounded-r-full ${bar}`} />
      <div className="pl-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-mute font-semibold">
          {label}
        </div>
        <div className="font-display text-3xl font-bold text-navy-900 mt-2">
          {value}
        </div>
        {hint && <div className="text-[11.5px] text-mute mt-1">{hint}</div>}
      </div>
    </div>
  );
}

async function resolveSubmissionTitles(
  sb: ReturnType<typeof createAdminClient>,
  submissionIds: string[],
): Promise<Record<string, string>> {
  if (submissionIds.length === 0) return {};
  // Two-step lookup (separate queries instead of an embedded select) because
  // the Phase 1 typegen doesn't carry FK Relationships.
  const { data: subs } = await sb
    .from("amb_submissions")
    .select("id, activity_id")
    .in("id", submissionIds);
  if (!subs || subs.length === 0) return {};
  const activityIds = Array.from(new Set(subs.map((s) => s.activity_id)));
  const { data: activities } = await sb
    .from("amb_activities")
    .select("id, title")
    .in("id", activityIds);
  const titleByActivity = Object.fromEntries(
    (activities ?? []).map((a) => [a.id, a.title]),
  );
  return Object.fromEntries(
    subs.map((s) => [s.id, titleByActivity[s.activity_id] ?? "Submission award"]),
  );
}

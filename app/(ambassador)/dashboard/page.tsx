import Link from "next/link";
import { ArrowRight, Crown, Sparkles, Star, Trophy } from "lucide-react";

import { fmtDate } from "@/components/admin/table";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserTier, type UserTier } from "@/lib/tiers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · Yuvaah" };

const LEADERBOARD_TOP_N = 3;
const RECENT_ACTIVITY_LIMIT = 6;

export default async function DashboardHome() {
  const { profileId, profile } = await requireAmbassador();
  const sb = createAdminClient();

  // All aggregates in parallel.
  const [balanceRes, totalEarnedRes, submissionsRes, activitiesRes, leaderboardRes, recentLedgerRes, tier, tiersRes] =
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
      getUserTier(sb, profileId),
      // The full tier ladder so members can see what's above (and below)
      // their current rank — a motivation nudge.
      sb
        .from("amb_tiers")
        .select("rank, name, threshold_points, points_to_inr_rate")
        .order("rank", { ascending: true }),
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
  const allTiers = (tiersRes.data ?? []).map((t) => ({
    rank: t.rank,
    name: t.name,
    threshold_points: t.threshold_points,
    // numeric columns serialize as strings via PostgREST.
    points_to_inr_rate: Number(t.points_to_inr_rate),
  }));

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

      {tier && <TierCard tier={tier} />}
      {allTiers.length > 0 && (
        <TierLadder tiers={allTiers} currentRank={tier?.rank ?? null} />
      )}

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

type TierLadderRow = {
  rank: number;
  name: string;
  threshold_points: number;
  points_to_inr_rate: number;
};

function TierLadder({
  tiers,
  currentRank,
}: {
  tiers: TierLadderRow[];
  currentRank: number | null;
}) {
  return (
    <section className="rounded-2xl bg-paper-2 ring-1 ring-line p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={14} className="text-amber-500" />
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
          Tier ladder
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiers.map((t) => {
          const isCurrent = t.rank === currentRank;
          const achieved = currentRank !== null && t.rank < currentRank;
          return (
            <div
              key={t.rank}
              className={
                "rounded-xl p-3.5 ring-1 transition-colors " +
                (isCurrent
                  ? "bg-amber-500/10 ring-amber-500/40"
                  : achieved
                    ? "bg-paper ring-line"
                    : "bg-paper ring-line")
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    "inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-display font-bold " +
                    (isCurrent
                      ? "bg-amber-500 text-white"
                      : achieved
                        ? "bg-cyan-500/15 text-navy-800 ring-1 ring-cyan-300/60"
                        : "bg-paper-2 text-mute ring-1 ring-line")
                  }
                >
                  {t.rank}
                </span>
                {isCurrent && (
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-500">
                    you
                  </span>
                )}
                {achieved && !isCurrent && (
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-cyan-500">
                    reached
                  </span>
                )}
              </div>
              <div className="mt-2 font-display text-[16px] font-semibold text-navy-900 truncate">
                {t.name}
              </div>
              <div className="mt-1 text-[11.5px] text-mute font-mono">
                {t.threshold_points === 0
                  ? "From 0 pts"
                  : `${t.threshold_points.toLocaleString()}+ pts`}
              </div>
              <div className="mt-0.5 text-[11.5px] text-mute">
                ₹{t.points_to_inr_rate.toFixed(2)} per point
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TierCard({ tier }: { tier: UserTier }) {
  const atTop = tier.next_threshold === null;
  // Width of the progress bar, as a percentage of the gap between this
  // tier's threshold and the next tier's. Clamped 0..100 because
  // lifetime_earned can briefly exceed the next threshold during the same
  // RPC call but before the row recomputes (it can't, actually — the RPC
  // is consistent — but the clamp is cheap and forgiving).
  const span = atTop ? 0 : (tier.next_threshold ?? 0) - tier.threshold_points;
  const progressed = Math.max(0, tier.lifetime_earned - tier.threshold_points);
  const pct = atTop
    ? 100
    : Math.min(100, Math.max(0, span > 0 ? (progressed / span) * 100 : 0));
  const toGo = atTop
    ? 0
    : Math.max(0, (tier.next_threshold ?? 0) - tier.lifetime_earned);

  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-5">
      <div className="flex items-center gap-4 md:min-w-[280px]">
        <div className="h-14 w-14 rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30 grid place-items-center text-amber-500 shrink-0">
          <Sparkles size={22} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-mute font-semibold">
            Your tier
          </div>
          <div className="font-display text-2xl font-semibold text-navy-900 mt-0.5">
            {tier.name}
            <span className="text-mute font-normal text-[13px] ml-2">
              · Level {tier.rank}
            </span>
          </div>
          <div className="text-[12.5px] text-mute mt-0.5">
            ₹{tier.points_to_inr_rate.toFixed(2)} per point at checkout
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <div className="text-[12px] text-mute">
            Lifetime earned:{" "}
            <span className="font-semibold text-navy-900">
              {tier.lifetime_earned}
            </span>{" "}
            pts
          </div>
          <div className="text-[12px] text-mute">
            {atTop
              ? "Top tier — keep earning to stay there."
              : `${toGo} pts to next tier`}
          </div>
        </div>
        <div className="h-2 rounded-full bg-paper ring-1 ring-line overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-mono text-mute">
          <span>{tier.threshold_points}</span>
          {!atTop && <span>{tier.next_threshold}</span>}
        </div>
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

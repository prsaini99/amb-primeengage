import { PageHeading } from "@/components/admin/table";
import { TiersForm, type TierRow } from "@/components/admin/tiers-form";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tiers · Admin" };

export default async function AdminTiersPage() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("amb_tiers")
    .select("rank, name, threshold_points, points_to_inr_rate")
    .order("rank", { ascending: true });

  // numeric columns come back as strings from PostgREST; coerce here so
  // the form gets a real number (and so the validation server-side has
  // something equivalent to compare against).
  const tiers: TierRow[] = (data ?? []).map((t) => ({
    rank: t.rank,
    name: t.name,
    threshold_points: t.threshold_points,
    points_to_inr_rate: Number(t.points_to_inr_rate),
  }));

  return (
    <>
      <PageHeading
        title="Tiers"
        subtitle="Loyalty ladder for Yuvaah Club members. Each tier sets its own points-to-INR conversion rate for hybrid (points + money) checkouts."
      />

      <div className="max-w-4xl space-y-6">
        {error && (
          <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
            {error.message}
          </div>
        )}

        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-5 text-[12.5px] text-mute leading-relaxed space-y-2">
          <p>
            Tier is derived from <strong>lifetime earned points</strong> — the
            same number that shows up as &quot;Total earned&quot; on a member&apos;s dashboard.
            Spending points never demotes a member; the ladder only goes up.
          </p>
          <p>
            Tier 1&apos;s threshold is fixed at 0 so every newly-approved member
            qualifies for it on day one. Higher tiers&apos; thresholds must be
            strictly increasing.
          </p>
        </div>

        {tiers.length === 5 && <TiersForm initialTiers={tiers} />}
      </div>
    </>
  );
}

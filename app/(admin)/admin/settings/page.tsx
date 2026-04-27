import { PageHeading } from "@/components/admin/table";
import { SettingsForm } from "@/components/admin/settings-form";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Admin" };

const DEFAULT_RATE = 0.10;

export default async function AdminSettingsPage() {
  const sb = createAdminClient();
  const { data } = await sb
    .from("amb_settings")
    .select("value")
    .eq("key", "points_to_inr_rate")
    .maybeSingle();

  // amb_settings.value is jsonb. We seeded a number, so the round-trip is a
  // number. Defensively coerce — admin could overwrite it from SQL someday.
  const rate =
    typeof data?.value === "number"
      ? data.value
      : Number(data?.value ?? DEFAULT_RATE) || DEFAULT_RATE;

  return (
    <>
      <PageHeading
        title="Settings"
        subtitle="Global configuration. Settings are admin-only."
      />

      <div className="max-w-2xl">
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
            Rewards
          </h3>
          <SettingsForm initialRate={rate} />
        </div>
      </div>
    </>
  );
}

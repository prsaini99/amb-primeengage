import Link from "next/link";

import { Badge, fmtDate } from "@/components/admin/table";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activities · Ambassador" };

type SubmissionState = "open" | "closed" | "submitted" | "awarded";

function stateMeta(s: SubmissionState):
  | { tone: "success" | "warn" | "info" | "neutral"; label: string } {
  switch (s) {
    case "open":      return { tone: "success", label: "open" };
    case "closed":    return { tone: "warn",    label: "closed" };
    case "submitted": return { tone: "info",    label: "submitted" };
    case "awarded":   return { tone: "neutral", label: "awarded" };
  }
}

export default async function AmbassadorActivitiesPage() {
  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  // Active activities only — admin's archived ones don't appear here.
  const { data: activities, error: actErr } = await sb
    .from("amb_activities")
    .select("id, title, description, points, submission_deadline, cover_image_url, created_at")
    .eq("is_active", true)
    .order("submission_deadline", { ascending: true });
  if (actErr) {
    return (
      <ErrorPanel message={actErr.message} />
    );
  }

  // Find which ones the ambassador has already submitted to. One indexed
  // round-trip; merged in JS.
  const ids = (activities ?? []).map((a) => a.id);
  const submissions = await getSubmissionsForUser(sb, profileId, ids);

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Activities
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Complete tasks to earn points. Submissions lock on save — review
          carefully before you submit.
        </p>
      </div>

      {(!activities || activities.length === 0) && (
        <EmptyState />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {activities?.map((a) => {
          const sub = submissions[a.id];
          const state: SubmissionState = sub
            ? sub.status === "awarded"
              ? "awarded"
              : "submitted"
            : new Date(a.submission_deadline).getTime() < Date.now()
              ? "closed"
              : "open";
          const meta = stateMeta(state);
          return (
            <Link
              key={a.id}
              href={`/dashboard/activities/${a.id}`}
              className="group rounded-2xl bg-paper-2 ring-1 ring-line shadow-soft hover:ring-navy-800/30 hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
            >
              <div className="aspect-[16/9] bg-paper relative">
                {a.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.cover_image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 brand-gradient opacity-90" />
                )}
                <div className="absolute top-3 right-3">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-display text-[18px] font-semibold text-navy-900 leading-tight group-hover:text-amber-500 transition-colors">
                  {a.title}
                </h3>
                <p className="mt-2 text-[13px] text-mute line-clamp-2">
                  {a.description}
                </p>
                <div className="mt-auto pt-4 flex items-center justify-between text-[12.5px]">
                  <div className="flex items-center gap-1.5 text-navy-800 font-semibold">
                    <span className="font-display text-[18px]">{a.points}</span>
                    <span className="text-mute font-normal">points</span>
                  </div>
                  <div className="text-mute">
                    {state === "awarded" && sub
                      ? `Awarded ${sub.awarded_points ?? 0}`
                      : `By ${fmtDate(a.submission_deadline)}`}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-10 text-center">
      <p className="text-[14px] text-mute">
        No activities are open right now. Check back soon.
      </p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
      {message}
    </div>
  );
}

async function getSubmissionsForUser(
  sb: ReturnType<typeof createAdminClient>,
  userId: string,
  activityIds: string[],
): Promise<Record<string, { status: string; awarded_points: number | null }>> {
  if (activityIds.length === 0) return {};
  const { data } = await sb
    .from("amb_submissions")
    .select("activity_id, status, awarded_points")
    .eq("user_id", userId)
    .in("activity_id", activityIds);
  if (!data) return {};
  return Object.fromEntries(
    data.map((s) => [
      s.activity_id,
      { status: s.status, awarded_points: s.awarded_points },
    ]),
  );
}

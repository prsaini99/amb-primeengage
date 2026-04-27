import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge, fmtDate } from "@/components/admin/table";
import { ActivityForm } from "@/components/admin/activity-form";
import { ActivityArchiveButton } from "@/components/admin/activity-archive-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateActivity } from "@/app/actions/activities";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const { data: activity, error } = await sb
    .from("amb_activities")
    .select(
      "id, title, description, points, submission_deadline, cover_image_url, is_active, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        {error.message}
      </div>
    );
  }
  if (!activity) notFound();

  const { count: submissionCount } = await sb
    .from("amb_submissions")
    .select("*", { head: true, count: "exact" })
    .eq("activity_id", id);

  const status = activity.is_active
    ? new Date(activity.submission_deadline).getTime() < Date.now()
      ? { tone: "warn" as const, label: "closed" }
      : { tone: "success" as const, label: "open" }
    : { tone: "danger" as const, label: "archived" };

  // Bind the activity id into the server action so the form's signature
  // stays (prev, FormData) — useActionState's contract.
  const action = updateActivity.bind(null, activity.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/activities"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to activities
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              {activity.title}
            </h1>
            <p className="text-[13.5px] text-mute mt-1">
              Created {fmtDate(activity.created_at)} · Deadline{" "}
              {fmtDate(activity.submission_deadline)} · {submissionCount ?? 0}{" "}
              submission{(submissionCount ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
              Edit
            </h3>
            <ActivityForm
              mode="edit"
              action={action}
              initial={{
                title: activity.title,
                description: activity.description,
                points: activity.points,
                submission_deadline: activity.submission_deadline,
                cover_image_url: activity.cover_image_url,
              }}
            />
          </div>
        </section>

        <aside className="space-y-6">
          <Card title="Lifecycle">
            <ActivityArchiveButton id={activity.id} isActive={activity.is_active} />
            <p className="mt-3 text-[12.5px] text-mute leading-relaxed">
              Archiving hides the activity from ambassadors and blocks new
              submissions at the database level (BEFORE INSERT trigger). Existing
              submissions stay visible in admin.
            </p>
          </Card>

          <Card title="Submissions">
            <p className="text-[14px] text-navy-900">
              <span className="font-display text-3xl font-bold">
                {submissionCount ?? 0}
              </span>{" "}
              submitted
            </p>
            <Link
              href={`/admin/activities/${activity.id}/submissions`}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy-800 hover:text-amber-500"
            >
              View submissions →
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6">
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

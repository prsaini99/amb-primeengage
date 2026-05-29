import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, FileText, Lock, Star } from "lucide-react";

import { Badge, fmtDate } from "@/components/admin/table";
import { SubmissionForm } from "@/components/dashboard/submission-form";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export default async function AmbassadorActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profileId } = await requireAmbassador();
  const sb = createAdminClient();

  const { data: activity, error: actErr } = await sb
    .from("amb_activities")
    .select("id, title, description, points, submission_deadline, cover_image_url, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (actErr) {
    return <ErrorPanel message={actErr.message} />;
  }
  if (!activity || !activity.is_active) notFound();

  // Existing submission?
  const { data: submission } = await sb
    .from("amb_submissions")
    .select("id, status, awarded_points, text_content, created_at, reviewed_at")
    .eq("activity_id", id)
    .eq("user_id", profileId)
    .maybeSingle();

  let submissionFiles: { id: string; storage_path: string; file_type: string; file_size: number; signedUrl: string | null }[] = [];
  if (submission) {
    const { data: files } = await sb
      .from("amb_submission_files")
      .select("id, storage_path, file_type, file_size")
      .eq("submission_id", submission.id);
    if (files) {
      // Sign URLs in parallel for previews.
      const signed = await Promise.all(
        files.map(async (f) => {
          const { data: s } = await sb.storage
            .from("amb_submissions")
            .createSignedUrl(f.storage_path, SIGNED_URL_TTL_SECONDS);
          return { ...f, signedUrl: s?.signedUrl ?? null };
        }),
      );
      submissionFiles = signed;
    }
  }

  const past = new Date(activity.submission_deadline).getTime() < Date.now();
  const stateMeta = submission
    ? submission.status === "awarded"
      ? { tone: "neutral" as const, label: `awarded ${submission.awarded_points ?? 0}` }
      : { tone: "info" as const, label: "submitted" }
    : past
      ? { tone: "warn" as const, label: "closed" }
      : { tone: "success" as const, label: "open" };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/activities"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> All activities
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              {activity.title}
            </h1>
            <div className="text-[13.5px] text-mute mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Star size={14} className="text-amber-500" />
                {activity.points} points
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} />
                Deadline {fmtDate(activity.submission_deadline)}
              </span>
            </div>
          </div>
          <Badge tone={stateMeta.tone}>{stateMeta.label}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          {activity.cover_image_url && (
            // Render the poster at its natural aspect ratio so the whole
            // image is always visible — no fixed box, no cropping. `w-full`
            // fills the column width and the global `img { height: auto }`
            // rule (globals.css) keeps the height proportional.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activity.cover_image_url}
              alt=""
              className="block w-full h-auto rounded-2xl ring-1 ring-line bg-paper"
            />
          )}

          <Card title="Brief">
            <p className="text-[14.5px] leading-relaxed text-ink whitespace-pre-wrap">
              {activity.description}
            </p>
          </Card>

          {submission && (
            <Card title="Your submission">
              <p className="text-[12.5px] text-mute mb-3">
                Submitted {fmtDate(submission.created_at)}
                {submission.reviewed_at &&
                  ` · reviewed ${fmtDate(submission.reviewed_at)}`}
              </p>
              {submission.text_content && (
                <p className="text-[14px] text-ink whitespace-pre-wrap mb-4">
                  {submission.text_content}
                </p>
              )}
              {submissionFiles.length > 0 && (
                <ul className="space-y-2">
                  {submissionFiles.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-lg bg-paper ring-1 ring-line px-3 py-2 text-[13px]"
                    >
                      <FileText size={14} className="text-mute" />
                      <span className="font-mono text-[12.5px] text-mute truncate flex-1">
                        {f.storage_path.split("/").pop()}
                      </span>
                      <span className="text-mute text-[12px] whitespace-nowrap">
                        {(f.file_size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      {f.signedUrl && (
                        <a
                          href={f.signedUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
                        >
                          Open
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </section>

        <aside className="space-y-6">
          {!submission && !past && (
            <Card title="Submit">
              <SubmissionForm activityId={activity.id} />
            </Card>
          )}
          {!submission && past && (
            <Card title="Window closed">
              <div className="flex items-start gap-3 text-[13.5px] text-mute">
                <Lock size={16} className="mt-0.5 shrink-0" />
                <p>
                  This activity's submission deadline passed on{" "}
                  <strong>{fmtDate(activity.submission_deadline)}</strong>. New
                  submissions are no longer accepted.
                </p>
              </div>
            </Card>
          )}
          {submission && submission.status !== "awarded" && (
            <Card title="What happens next">
              <p className="text-[13.5px] text-mute leading-relaxed">
                The team will review your submission. You'll see the awarded
                points appear here once it's approved.
              </p>
            </Card>
          )}
          {submission && submission.status === "awarded" && (
            <Card title="Awarded">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold text-navy-900">
                  {submission.awarded_points ?? 0}
                </span>
                <span className="text-[14px] text-mute">points</span>
              </div>
              <p className="mt-2 text-[12.5px] text-mute">
                Reviewed {submission.reviewed_at ? fmtDate(submission.reviewed_at) : "—"}.
              </p>
            </Card>
          )}
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

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
      {message}
    </div>
  );
}

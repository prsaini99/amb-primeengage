import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { Badge, fmtDate } from "@/components/admin/table";
import { AwardForm } from "@/components/admin/award-form";
import { AdjustAwardCollapse } from "@/components/admin/adjust-award-collapse";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const { data: submission, error } = await sb
    .from("amb_submissions")
    .select(
      "id, status, awarded_points, text_content, created_at, reviewed_at, reviewed_by, user_id, activity_id",
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
  if (!submission) notFound();

  // Fan out the dependent queries in parallel.
  const [activityRes, profileRes, filesRes, reviewerRes] = await Promise.all([
    sb
      .from("amb_activities")
      .select("id, title, points")
      .eq("id", submission.activity_id)
      .maybeSingle(),
    sb
      .from("amb_profiles")
      .select("first_name, last_name, email")
      .eq("id", submission.user_id)
      .maybeSingle(),
    sb
      .from("amb_submission_files")
      .select("id, storage_path, file_type, file_size")
      .eq("submission_id", submission.id),
    submission.reviewed_by
      ? sb
          .from("amb_profiles")
          .select("first_name, last_name")
          .eq("id", submission.reviewed_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const activity = activityRes.data;
  const profile = profileRes.data;
  if (!activity || !profile) notFound();

  const files = filesRes.data ?? [];
  const reviewer = reviewerRes.data;
  const reviewerName = reviewer
    ? `${reviewer.first_name} ${reviewer.last_name}`.trim()
    : null;

  // Sign storage URLs for previews / download.
  const filesWithUrls = await Promise.all(
    files.map(async (f) => {
      const { data: signed } = await sb.storage
        .from("amb_submissions")
        .createSignedUrl(f.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...f, signedUrl: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/activities/${activity.id}/submissions`}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to submissions
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-[13.5px] text-mute mt-1">
              <Link
                href={`/admin/activities/${activity.id}`}
                className="hover:text-navy-900"
              >
                {activity.title}
              </Link>
              {" · "}
              Submitted {fmtDate(submission.created_at)}
              {submission.reviewed_at &&
                ` · awarded ${fmtDate(submission.reviewed_at)}${reviewerName ? ` by ${reviewerName}` : ""}`}
            </p>
          </div>
          <Badge tone={submission.status === "awarded" ? "success" : "info"}>
            {submission.status === "awarded"
              ? `awarded ${submission.awarded_points ?? 0}`
              : "submitted"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          <Card title="Ambassador">
            <KV
              label="Name"
              value={`${profile.first_name} ${profile.last_name}`}
            />
            <KV label="Email" value={profile.email} mono />
          </Card>

          {submission.text_content && (
            <Card title="Notes">
              <p className="text-[14.5px] leading-relaxed text-ink whitespace-pre-wrap">
                {submission.text_content}
              </p>
            </Card>
          )}

          <Card title={`Files (${filesWithUrls.length})`}>
            {filesWithUrls.length === 0 && (
              <p className="text-[13.5px] text-mute">No files attached.</p>
            )}
            {filesWithUrls.length > 0 && (
              <ul className="space-y-3">
                {filesWithUrls.map((f) => {
                  const fileName = f.storage_path.split("/").pop() ?? "file";
                  const isImage = f.file_type.startsWith("image/");
                  return (
                    <li
                      key={f.id}
                      className="rounded-lg bg-paper ring-1 ring-line p-3"
                    >
                      <div className="flex items-center gap-3">
                        <FileText size={14} className="text-mute" />
                        <span className="font-mono text-[12.5px] text-mute truncate flex-1">
                          {fileName}
                        </span>
                        <span className="text-mute text-[12px] whitespace-nowrap">
                          {(f.file_size / 1024 / 1024).toFixed(2)} MB ·{" "}
                          {f.file_type}
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
                      </div>
                      {isImage && f.signedUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.signedUrl}
                          alt=""
                          className="mt-3 max-h-[360px] w-auto rounded-md ring-1 ring-line"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <aside className="space-y-6">
          {submission.status === "submitted" && (
            <Card title="Award">
              <AwardForm
                submissionId={submission.id}
                defaultPoints={activity.points}
              />
              <p className="mt-4 text-[12.5px] text-mute leading-relaxed">
                Awarding writes the ledger entry and emails the ambassador.
                One-shot — the form disappears once awarded.
              </p>
            </Card>
          )}
          {submission.status === "awarded" && (
            <Card title="Awarded">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-bold text-navy-900">
                  {submission.awarded_points ?? 0}
                </span>
                <span className="text-[14px] text-mute">points</span>
              </div>
              <p className="mt-2 text-[12.5px] text-mute">
                Reviewed{" "}
                {submission.reviewed_at
                  ? fmtDate(submission.reviewed_at)
                  : "—"}
                {reviewerName && ` by ${reviewerName}`}.
              </p>
              <AdjustAwardCollapse
                submissionId={submission.id}
                currentPoints={submission.awarded_points ?? 0}
              />
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

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-4 py-2 first:pt-0 border-b border-line last:border-0">
      <div className="min-w-[100px] text-[12px] text-mute font-medium">
        {label}
      </div>
      <div
        className={
          "text-[14px] text-navy-900 " + (mono ? "font-mono text-[13px]" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

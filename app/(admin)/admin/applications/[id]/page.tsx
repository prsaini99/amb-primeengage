import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { Badge, fmtDate } from "@/components/admin/table";
import { ApplicationActions } from "@/components/admin/application-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApplicationData } from "@/lib/ambassador/types";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes is plenty for review

function statusTone(s: string) {
  if (s === "approved") return "success" as const;
  if (s === "rejected") return "danger" as const;
  if (s === "suspended") return "warn" as const;
  return "info" as const; // pending
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const { data: row, error } = await sb
    .from("amb_profiles")
    .select(
      "id, role, status, first_name, last_name, email, phone, college, city, student_id_url, application_data, created_at, approved_at, rejected_at",
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
  if (!row || row.role !== "ambassador") {
    notFound();
  }

  const data = (row.application_data as ApplicationData | null) ?? null;

  // Generate a short-lived signed URL for the Student ID upload. The bucket
  // is private; only the service role can issue these.
  let studentIdUrl: string | null = null;
  let studentIdMime: string | null = null;
  if (row.student_id_url) {
    const { data: signed, error: signErr } = await sb.storage
      .from("amb_applications")
      .createSignedUrl(row.student_id_url, SIGNED_URL_TTL_SECONDS);
    if (!signErr) studentIdUrl = signed?.signedUrl ?? null;
    // Best-effort MIME from the path extension (no need to fetch the file).
    const ext = row.student_id_url.split(".").pop()?.toLowerCase();
    if (ext === "pdf") studentIdMime = "application/pdf";
    else if (ext === "jpg" || ext === "jpeg") studentIdMime = "image/jpeg";
    else if (ext === "png") studentIdMime = "image/png";
    else if (ext === "webp") studentIdMime = "image/webp";
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/applications"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to applications
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-navy-900">
              {row.first_name} {row.last_name}
            </h1>
            <p className="text-[13.5px] text-mute mt-1">
              Applied {fmtDate(row.created_at)}
              {row.approved_at && ` · approved ${fmtDate(row.approved_at)}`}
              {row.rejected_at && ` · rejected ${fmtDate(row.rejected_at)}`}
            </p>
          </div>
          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          <Card title="Contact">
            <KV label="Email" value={row.email} mono />
            <KV label="Phone" value={row.phone} mono />
            <KV label="College" value={row.college} />
            <KV label="City" value={row.city} />
          </Card>

          {data && (
            <>
              <Card title="Survey">
                <KV label="Fest involvement" value={data.fest_involvement} />
                <KV label="Go-to activity" value={data.go_to_activity} />
                <KV label="Active platform" value={data.active_platform} />
                <KV label="Follower range" value={data.follower_range} />
                {data.referral_code && (
                  <KV label="Referral code" value={data.referral_code} mono />
                )}
              </Card>

              <Card title="Why join">
                <p className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
                  {data.why_join}
                </p>
              </Card>

              <Card title="What makes them stand out">
                <p className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
                  {data.stand_out}
                </p>
              </Card>
            </>
          )}
        </section>

        <aside className="space-y-6">
          {row.status === "pending" && (
            <Card title="Decision">
              <ApplicationActions id={row.id} />
              <p className="mt-4 text-[12.5px] text-mute leading-relaxed">
                Approving creates the auth user, links it, and emails
                credentials. Rejecting flips status and emails a polite
                templated note. Both actions are one-shot per application.
              </p>
            </Card>
          )}

          <Card title="Student ID Card">
            {!row.student_id_url && (
              <p className="text-[13px] text-mute">
                No file uploaded with this application.
              </p>
            )}
            {row.student_id_url && !studentIdUrl && (
              <p className="text-[13px] text-amber-500">
                Could not generate a preview URL. Path:{" "}
                <code className="font-mono text-[12px]">
                  {row.student_id_url}
                </code>
              </p>
            )}
            {studentIdUrl && studentIdMime?.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studentIdUrl}
                alt="Student ID Card"
                className="w-full rounded-lg ring-1 ring-line"
              />
            )}
            {studentIdUrl && studentIdMime === "application/pdf" && (
              <a
                href={studentIdUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-navy-800 hover:text-amber-500"
              >
                <FileText size={14} /> Open PDF in new tab
              </a>
            )}
            {studentIdUrl && (
              <p className="mt-3 text-[11.5px] text-mute">
                Signed URL expires in {SIGNED_URL_TTL_SECONDS / 60} minutes.
              </p>
            )}
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
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
        {title}
      </h3>
      <div className="mt-4">{children}</div>
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
      <div className="min-w-[140px] text-[12px] text-mute font-medium">
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

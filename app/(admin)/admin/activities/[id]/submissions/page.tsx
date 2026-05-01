import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  PageHeading,
  TableShell,
  Th,
  Td,
  Badge,
  fmtDate,
} from "@/components/admin/table";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ActivitySubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const { data: activity } = await sb
    .from("amb_activities")
    .select("id, title, points")
    .eq("id", id)
    .maybeSingle();
  if (!activity) notFound();

  const { data: submissions, error } = await sb
    .from("amb_submissions")
    .select("id, status, awarded_points, created_at, reviewed_at, user_id")
    .eq("activity_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        {error.message}
      </div>
    );
  }

  const subRows = submissions ?? [];

  // Two batched lookups: profile names and per-submission file counts.
  const userIds = Array.from(new Set(subRows.map((s) => s.user_id)));
  const subIds = subRows.map((s) => s.id);
  const [profilesById, fileCountsBySub] = await Promise.all([
    getProfilesById(sb, userIds),
    getFileCounts(sb, subIds),
  ]);

  const pendingCount = subRows.filter((s) => s.status === "submitted").length;
  const awardedCount = subRows.filter((s) => s.status === "awarded").length;

  return (
    <>
      <Link
        href={`/admin/activities/${activity.id}`}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900 mb-3"
      >
        <ArrowLeft size={14} /> Back to activity
      </Link>

      <PageHeading
        title={`Submissions · ${activity.title}`}
        subtitle={`${subRows.length} total · ${pendingCount} awaiting review · ${awardedCount} awarded · ${activity.points} default points`}
      />

      <TableShell>
        <thead>
          <tr>
            <Th>Submitted</Th>
            <Th>Member</Th>
            <Th>Files</Th>
            <Th>Status</Th>
            <Th>Awarded</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {subRows.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No submissions yet.
              </td>
            </tr>
          )}
          {subRows.map((s) => {
            const profile = profilesById[s.user_id];
            return (
              <tr key={s.id} className="hover:bg-paper/60">
                <Td className="text-mute whitespace-nowrap">
                  {fmtDate(s.created_at)}
                </Td>
                <Td>
                  <div className="font-semibold">
                    {profile?.first_name} {profile?.last_name}
                  </div>
                  <div className="text-mute text-[12.5px]">{profile?.email}</div>
                </Td>
                <Td className="font-mono text-[13px]">
                  {fileCountsBySub[s.id] ?? 0}
                </Td>
                <Td>
                  <Badge tone={s.status === "awarded" ? "success" : "info"}>
                    {s.status}
                  </Badge>
                </Td>
                <Td className="font-mono text-[13px]">
                  {s.awarded_points ?? "—"}
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/submissions/${s.id}`}
                    className="text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
                  >
                    Review →
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </>
  );
}

type ProfileLite = { first_name: string; last_name: string; email: string };

async function getProfilesById(
  sb: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Record<string, ProfileLite>> {
  if (ids.length === 0) return {};
  const { data } = await sb
    .from("amb_profiles")
    .select("id, first_name, last_name, email")
    .in("id", ids);
  if (!data) return {};
  return Object.fromEntries(data.map((p) => [p.id, p]));
}

async function getFileCounts(
  sb: ReturnType<typeof createAdminClient>,
  submissionIds: string[],
): Promise<Record<string, number>> {
  if (submissionIds.length === 0) return {};
  const { data } = await sb
    .from("amb_submission_files")
    .select("submission_id")
    .in("submission_id", submissionIds);
  if (!data) return {};
  const out: Record<string, number> = {};
  for (const r of data) out[r.submission_id] = (out[r.submission_id] ?? 0) + 1;
  return out;
}

import Link from "next/link";
import { Plus } from "lucide-react";

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
export const metadata = { title: "Activities · Admin" };

export default async function ActivitiesPage() {
  const sb = createAdminClient();

  const { data: activities, error } = await sb
    .from("amb_activities")
    .select("id, title, points, submission_deadline, cover_image_url, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <>
        <PageHeading title="Activities" subtitle="Failed to load activities." />
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      </>
    );
  }

  // Submission counts in one round-trip; merge in JS. Activities cardinality
  // is low (<<100), so this is fine for Phase 1. Revisit with a SQL view if
  // it ever grows.
  const ids = (activities ?? []).map((a) => a.id);
  const counts = await getSubmissionCounts(sb, ids);

  return (
    <>
      <PageHeading
        title="Activities"
        subtitle="Tasks ambassadors can complete to earn points."
        actions={
          <Link
            href="/admin/activities/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-amber-500 text-white text-[12.5px] font-semibold hover:bg-amber-400"
          >
            <Plus size={14} /> New activity
          </Link>
        }
      />

      <TableShell>
        <thead>
          <tr>
            <Th>Cover</Th>
            <Th>Title</Th>
            <Th>Points</Th>
            <Th>Deadline</Th>
            <Th>Submissions</Th>
            <Th>Status</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {(!activities || activities.length === 0) && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No activities yet. <Link href="/admin/activities/new" className="text-navy-800 font-semibold hover:text-amber-500">Create the first one →</Link>
              </td>
            </tr>
          )}
          {activities?.map((a) => {
            const status = activityStatus(a);
            return (
              <tr key={a.id} className="hover:bg-paper/60">
                <Td>
                  {a.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.cover_image_url}
                      alt=""
                      className="h-10 w-14 rounded-md object-cover ring-1 ring-line"
                    />
                  ) : (
                    <div className="h-10 w-14 rounded-md bg-paper ring-1 ring-line" />
                  )}
                </Td>
                <Td className="font-semibold">{a.title}</Td>
                <Td className="font-mono text-[13px]">{a.points}</Td>
                <Td className="text-mute whitespace-nowrap">
                  {fmtDate(a.submission_deadline)}
                </Td>
                <Td className="text-mute font-mono text-[13px]">
                  {counts[a.id] ?? 0}
                </Td>
                <Td>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/activities/${a.id}`}
                    className="text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
                  >
                    Open →
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

function activityStatus(a: { is_active: boolean; submission_deadline: string }):
  | { tone: "success" | "warn" | "danger"; label: string } {
  if (!a.is_active) return { tone: "danger", label: "archived" };
  if (new Date(a.submission_deadline).getTime() < Date.now()) {
    return { tone: "warn", label: "closed" };
  }
  return { tone: "success", label: "open" };
}

async function getSubmissionCounts(
  sb: ReturnType<typeof createAdminClient>,
  activityIds: string[],
): Promise<Record<string, number>> {
  if (activityIds.length === 0) return {};
  const { data, error } = await sb
    .from("amb_submissions")
    .select("activity_id")
    .in("activity_id", activityIds);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const row of data) {
    out[row.activity_id] = (out[row.activity_id] ?? 0) + 1;
  }
  return out;
}

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
export const metadata = { title: "Quiz Rounds · Admin" };

type RoundStatus = "draft" | "active" | "closed";

function statusBadge(status: RoundStatus): { tone: "neutral" | "success" | "warn" | "danger" | "info"; label: string } {
  if (status === "active") return { tone: "success", label: "active" };
  if (status === "closed") return { tone: "warn", label: "closed" };
  return { tone: "neutral", label: "draft" };
}

export default async function QuizzesPage() {
  const sb = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rounds, error } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("id, title, status, questions_per_attempt, created_at, activated_at, closed_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <>
        <PageHeading title="Quiz Rounds" subtitle="Failed to load rounds." />
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      </>
    );
  }

  const ids = (rounds ?? []).map((r: { id: string }) => r.id);

  // Pool sizes and participant counts in bulk; merge in JS.
  const [poolCounts, participantCounts] = await Promise.all([
    getPoolCounts(sb, ids),
    getParticipantCounts(sb, ids),
  ]);

  return (
    <>
      <PageHeading
        title="Quiz Rounds"
        subtitle="Admin-controlled rounds of the Yuvaah Club quiz."
        actions={
          <Link
            href="/admin/quizzes/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-amber-500 text-white text-[12.5px] font-semibold hover:bg-amber-400"
          >
            <Plus size={14} /> New quiz
          </Link>
        }
      />

      <TableShell>
        <thead>
          <tr>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th>Pool</Th>
            <Th>Participants</Th>
            <Th>Created</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {(!rounds || rounds.length === 0) && (
            <tr>
              <td
                colSpan={6}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No quiz rounds yet.{" "}
                <Link href="/admin/quizzes/new" className="text-navy-800 font-semibold hover:text-amber-500">
                  Create the first one →
                </Link>
              </td>
            </tr>
          )}
          {rounds?.map((r: { id: string; title: string; status: RoundStatus; questions_per_attempt: number; created_at: string }) => {
            const badge = statusBadge(r.status);
            const pool = poolCounts[r.id] ?? 0;
            const participants = participantCounts[r.id] ?? 0;
            return (
              <tr key={r.id} className="hover:bg-paper/60">
                <Td className="font-semibold">{r.title}</Td>
                <Td>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </Td>
                <Td className="font-mono text-[13px]">
                  {pool}
                  {pool < r.questions_per_attempt && r.status === "draft" && (
                    <span className="ml-1.5 text-amber-500" title={`Need at least ${r.questions_per_attempt}`}>
                      ⚠
                    </span>
                  )}
                </Td>
                <Td className="font-mono text-[13px]">{participants}</Td>
                <Td className="text-mute whitespace-nowrap">{fmtDate(r.created_at)}</Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/quizzes/${r.id}`}
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

async function getPoolCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  roundIds: string[],
): Promise<Record<string, number>> {
  if (roundIds.length === 0) return {};
  const { data, error } = await sb
    .from("yuvaah_quiz_questions")
    .select("round_id")
    .in("round_id", roundIds);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const row of data) {
    out[row.round_id] = (out[row.round_id] ?? 0) + 1;
  }
  return out;
}

async function getParticipantCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  roundIds: string[],
): Promise<Record<string, number>> {
  if (roundIds.length === 0) return {};
  const { data, error } = await sb
    .from("yuvaah_quiz_attempts")
    .select("round_id")
    .in("round_id", roundIds);
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const row of data) {
    out[row.round_id] = (out[row.round_id] ?? 0) + 1;
  }
  return out;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/admin/clickable-row";
import {
  PageHeading,
  TableShell,
  Th,
  Td,
  Badge,
  fmtDate,
} from "@/components/admin/table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type AttemptRow = {
  id: string;
  profile_id: string;
  status: "in_progress" | "completed";
  score: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  unanswered_count: number | null;
  completed_at: string | null;
};

export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        Not authorized.
      </div>
    );
  }

  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const sb = createAdminClient();

  // Round title.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: round, error: roundErr } = await (sb as any)
    .from("yuvaah_quiz_rounds")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  if (roundErr) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        {roundErr.message}
      </div>
    );
  }
  if (!round) notFound();

  // Paginated attempts + exact total count.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attemptsRaw, count, error: attErr } = await (sb as any)
    .from("yuvaah_quiz_attempts")
    .select(
      "id, profile_id, status, score, correct_count, wrong_count, unanswered_count, completed_at",
      { count: "exact" },
    )
    .eq("round_id", id)
    .order("started_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (attErr) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        {attErr.message}
      </div>
    );
  }

  const attempts: AttemptRow[] = attemptsRaw ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Names for the participants on this page only.
  const profileIds = Array.from(new Set(attempts.map((a) => a.profile_id)));
  const nameById: Record<string, string> = {};
  if (profileIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles } = await (sb as any)
      .from("amb_profiles")
      .select("id, first_name, last_name")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      nameById[p.id as string] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/admin/quizzes/${id}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to round
        </Link>
        <div className="mt-3">
          <PageHeading
            title={`Responses · ${round.title as string}`}
            subtitle={`${total} participant${total === 1 ? "" : "s"} · click a row for full detail`}
          />
        </div>
      </div>

      <TableShell>
        <thead>
          <tr>
            <Th>Participant</Th>
            <Th>Status</Th>
            <Th>Score</Th>
            <Th>Correct</Th>
            <Th>Wrong</Th>
            <Th>Unanswered</Th>
            <Th>Submitted</Th>
            <Th className="w-8">{""}</Th>
          </tr>
        </thead>
        <tbody>
          {attempts.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No participants yet.
              </td>
            </tr>
          )}
          {attempts.map((a) => (
            <ClickableRow
              key={a.id}
              href={`/admin/quizzes/${id}/responses/${a.id}`}
            >
              <Td>
                <span className="font-semibold text-navy-900">
                  {nameById[a.profile_id] || "Unknown member"}
                </span>
              </Td>
              <Td>
                <Badge tone={a.status === "completed" ? "success" : "info"}>
                  {a.status === "completed" ? "completed" : "in progress"}
                </Badge>
              </Td>
              <Td className="font-mono text-[13px]">
                {a.score !== null ? a.score : "—"}
              </Td>
              <Td className="font-mono text-[13px] text-cyan-600">
                {a.correct_count !== null ? a.correct_count : "—"}
              </Td>
              <Td className="font-mono text-[13px] text-red-500">
                {a.wrong_count !== null ? a.wrong_count : "—"}
              </Td>
              <Td className="font-mono text-[13px] text-mute">
                {a.unanswered_count !== null ? a.unanswered_count : "—"}
              </Td>
              <Td className="text-mute whitespace-nowrap text-[12.5px]">
                {a.completed_at ? fmtDate(a.completed_at) : "—"}
              </Td>
              <Td className="text-mute">
                <ChevronRight size={15} />
              </Td>
            </ClickableRow>
          ))}
        </tbody>
      </TableShell>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] text-mute">
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex items-center gap-2">
            <PageLink
              roundId={id}
              page={page - 1}
              disabled={page <= 1}
              label="← Prev"
            />
            <PageLink
              roundId={id}
              page={page + 1}
              disabled={page >= totalPages}
              label="Next →"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({
  roundId,
  page,
  disabled,
  label,
}: {
  roundId: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  const cls =
    "h-9 px-4 rounded-full ring-1 ring-line text-[13px] font-semibold inline-flex items-center transition-colors";
  if (disabled) {
    return (
      <span className={`${cls} text-mute/50 bg-paper-2 cursor-not-allowed`}>
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/admin/quizzes/${roundId}/responses?page=${page}`}
      className={`${cls} text-navy-800 bg-paper-2 hover:ring-navy-800/40`}
    >
      {label}
    </Link>
  );
}

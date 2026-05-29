import Link from "next/link";

import {
  PageHeading,
  TableShell,
  Th,
  Td,
  Badge,
  FilterBar,
  FilterChip,
  SearchInput,
  fmtDate,
} from "@/components/admin/table";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApplicationData } from "@/lib/ambassador/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications · Admin" };

type StatusFilter = "all" | "pending" | "approved" | "rejected";

function statusTone(s: string) {
  if (s === "approved") return "success" as const;
  if (s === "rejected") return "danger" as const;
  if (s === "suspended") return "warn" as const;
  return "info" as const; // pending
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter = (
    ["all", "pending", "approved", "rejected"].includes(params.status ?? "")
      ? params.status
      : "pending"
  ) as StatusFilter;

  const sb = createAdminClient();

  // RLS is enabled on amb_profiles with zero policies — service-role bypass
  // is intentional for the admin UI per docs/migration-tasks.md #3.
  let query = sb
    .from("amb_profiles")
    .select(
      "id, status, first_name, last_name, email, phone, college, city, application_data, referral_code, created_at",
    )
    .eq("role", "ambassador")
    .order("created_at", { ascending: false });

  if (filter !== "all") query = query.eq("status", filter);

  const { data: rows, error } = await query;
  if (error) {
    return (
      <>
        <PageHeading
          title="Applications"
          subtitle="Failed to load applications."
        />
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      </>
    );
  }

  // For the chip counts, fetch per-status counts in one round-trip with the
  // service role (head:true returns count without rows).
  const counts = await getStatusCounts(sb);

  return (
    <>
      <PageHeading
        title="Applications"
        subtitle="Yuvaah Club applications submitted via the marketing site."
      />

      <FilterBar>
        <FilterChipLink href="/admin/applications?status=all" active={filter === "all"}>
          All ({counts.all})
        </FilterChipLink>
        <FilterChipLink
          href="/admin/applications?status=pending"
          active={filter === "pending"}
        >
          Pending ({counts.pending})
        </FilterChipLink>
        <FilterChipLink
          href="/admin/applications?status=approved"
          active={filter === "approved"}
        >
          Approved ({counts.approved})
        </FilterChipLink>
        <FilterChipLink
          href="/admin/applications?status=rejected"
          active={filter === "rejected"}
        >
          Rejected ({counts.rejected})
        </FilterChipLink>
        <div className="ml-auto flex-1 flex justify-end">
          <SearchInput placeholder="Search name, email, college" />
        </div>
      </FilterBar>

      <TableShell>
        <thead>
          <tr>
            <Th>Received</Th>
            <Th>Name</Th>
            <Th>Email / Phone</Th>
            <Th>College / City</Th>
            <Th>Followers</Th>
            <Th>Referral</Th>
            <Th>Status</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {(!rows || rows.length === 0) && (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-10 text-center text-mute border-b border-line"
              >
                No applications match this filter.
              </td>
            </tr>
          )}
          {rows?.map((r) => {
            const data = (r.application_data as ApplicationData | null) ?? null;
            return (
              <tr key={r.id} className="hover:bg-paper/60">
                <Td className="text-mute whitespace-nowrap">
                  {fmtDate(r.created_at)}
                </Td>
                <Td className="font-semibold">
                  {r.first_name} {r.last_name}
                </Td>
                <Td>
                  <div>{r.email}</div>
                  <div className="text-mute text-[12.5px] font-mono">
                    {r.phone}
                  </div>
                </Td>
                <Td>
                  <div>{r.college}</div>
                  <div className="text-mute text-[12.5px]">{r.city}</div>
                </Td>
                <Td className="text-mute">{data?.follower_range ?? "—"}</Td>
                <Td>
                  {r.referral_code ? (
                    <span className="font-mono text-[12.5px] text-navy-900">
                      {r.referral_code}
                    </span>
                  ) : (
                    <span className="text-mute">—</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/applications/${r.id}`}
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

/** Server-side link-style chip (FilterChip from table.tsx is a button). */
function FilterChipLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "px-3.5 h-8 inline-flex items-center rounded-full text-[12.5px] font-medium ring-1 transition-colors " +
        (active
          ? "bg-navy-900 text-white ring-navy-900"
          : "bg-paper-2 text-mute ring-line-strong hover:text-navy-900")
      }
    >
      {children}
    </Link>
  );
}

async function getStatusCounts(sb: ReturnType<typeof createAdminClient>) {
  const base = sb.from("amb_profiles").select("*", { head: true, count: "exact" }).eq("role", "ambassador");
  const [all, pending, approved, rejected] = await Promise.all([
    base,
    sb.from("amb_profiles").select("*", { head: true, count: "exact" }).eq("role", "ambassador").eq("status", "pending"),
    sb.from("amb_profiles").select("*", { head: true, count: "exact" }).eq("role", "ambassador").eq("status", "approved"),
    sb.from("amb_profiles").select("*", { head: true, count: "exact" }).eq("role", "ambassador").eq("status", "rejected"),
  ]);
  return {
    all: all.count ?? 0,
    pending: pending.count ?? 0,
    approved: approved.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}

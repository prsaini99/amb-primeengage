import Link from "next/link";
import { Plus } from "lucide-react";

import {
  PageHeading,
  TableShell,
  Th,
  Td,
  fmtDate,
} from "@/components/admin/table";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events · Admin" };

export default async function AdminEventsPage() {
  const sb = createAdminClient();
  const { data: events, error } = await sb
    .from("amb_events")
    .select("id, title, body, cover_image_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <>
        <PageHeading title="Events" subtitle="Failed to load events." />
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Events"
        subtitle="Posts ambassadors see in their dashboard."
        actions={
          <Link
            href="/admin/events/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-amber-500 text-white text-[12.5px] font-semibold hover:bg-amber-400"
          >
            <Plus size={14} /> New event
          </Link>
        }
      />

      <TableShell>
        <thead>
          <tr>
            <Th>Cover</Th>
            <Th>Title</Th>
            <Th>Excerpt</Th>
            <Th>Posted</Th>
            <Th>{""}</Th>
          </tr>
        </thead>
        <tbody>
          {(!events || events.length === 0) && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-mute border-b border-line">
                No events yet.{" "}
                <Link
                  href="/admin/events/new"
                  className="text-navy-800 font-semibold hover:text-amber-500"
                >
                  Create the first one →
                </Link>
              </td>
            </tr>
          )}
          {events?.map((e) => (
            <tr key={e.id} className="hover:bg-paper/60">
              <Td>
                {e.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.cover_image_url}
                    alt=""
                    className="h-10 w-14 rounded-md object-cover ring-1 ring-line"
                  />
                ) : (
                  <div className="h-10 w-14 rounded-md bg-paper ring-1 ring-line" />
                )}
              </Td>
              <Td className="font-semibold">{e.title}</Td>
              <Td>
                <p className="line-clamp-2 text-mute max-w-[480px]">{e.body}</p>
              </Td>
              <Td className="text-mute whitespace-nowrap">{fmtDate(e.created_at)}</Td>
              <Td className="text-right">
                <Link
                  href={`/admin/events/${e.id}`}
                  className="text-[12.5px] font-semibold text-navy-800 hover:text-amber-500"
                >
                  Open →
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </>
  );
}

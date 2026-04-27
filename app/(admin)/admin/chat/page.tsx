import Link from "next/link";

import { PageHeading, fmtDate } from "@/components/admin/table";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat · Admin" };

type Ambassador = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

type ThreadRow = {
  ambassador: Ambassador;
  lastMessage: { body: string; created_at: string; from_admin: boolean } | null;
  unread: number;
};

export default async function AdminChatListPage() {
  const gate = await requireAdmin();
  // gate fails inside requireAdmin's redirect chain; if we got here, gate.ok is true.
  if (!gate.ok) return null;

  const adminProfileId = gate.profileId;
  const sb = createAdminClient();

  // Fetch all approved ambassadors + every chat message that involves admin.
  // Two queries; merged in JS. Cardinality is small in Phase 1.
  const [ambsRes, msgsRes] = await Promise.all([
    sb
      .from("amb_profiles")
      .select("id, first_name, last_name, email")
      .eq("role", "ambassador")
      .eq("status", "approved")
      .order("first_name", { ascending: true }),
    sb
      .from("amb_chat_messages")
      .select("id, sender_id, receiver_id, body, read_at, created_at")
      .or(`sender_id.eq.${adminProfileId},receiver_id.eq.${adminProfileId}`)
      .order("created_at", { ascending: false }),
  ]);

  const ambassadors = (ambsRes.data ?? []) as Ambassador[];
  const msgs = msgsRes.data ?? [];

  // Group: per-ambassador, last message + unread count from them.
  const lastByAmb = new Map<string, ThreadRow["lastMessage"]>();
  const unreadByAmb = new Map<string, number>();
  for (const m of msgs) {
    const otherId =
      m.sender_id === adminProfileId ? m.receiver_id : m.sender_id;
    if (!lastByAmb.has(otherId)) {
      lastByAmb.set(otherId, {
        body: m.body,
        created_at: m.created_at,
        from_admin: m.sender_id === adminProfileId,
      });
    }
    if (m.receiver_id === adminProfileId && m.read_at === null) {
      unreadByAmb.set(otherId, (unreadByAmb.get(otherId) ?? 0) + 1);
    }
  }

  const rows: ThreadRow[] = ambassadors.map((a) => ({
    ambassador: a,
    lastMessage: lastByAmb.get(a.id) ?? null,
    unread: unreadByAmb.get(a.id) ?? 0,
  }));

  // Sort: unread first, then most-recent-message, then alphabetical fallback.
  rows.sort((a, b) => {
    if ((b.unread > 0 ? 1 : 0) !== (a.unread > 0 ? 1 : 0)) {
      return b.unread - a.unread;
    }
    const aTs = a.lastMessage?.created_at ?? "";
    const bTs = b.lastMessage?.created_at ?? "";
    if (aTs !== bTs) return bTs.localeCompare(aTs);
    return a.ambassador.first_name.localeCompare(b.ambassador.first_name);
  });

  const totalUnread = rows.reduce((sum, r) => sum + r.unread, 0);

  return (
    <>
      <PageHeading
        title="Chat"
        subtitle={
          totalUnread > 0
            ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"} across ${rows.filter((r) => r.unread > 0).length} thread${rows.filter((r) => r.unread > 0).length === 1 ? "" : "s"}.`
            : "All caught up."
        }
      />

      {rows.length === 0 && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-10 text-center">
          <p className="text-[14px] text-mute">
            No approved ambassadors yet. Approve some applications to start chatting.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.ambassador.id}>
                <Link
                  href={`/admin/chat/${r.ambassador.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-paper/60 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full brand-gradient text-white grid place-items-center text-[12px] font-semibold uppercase shrink-0">
                    {(r.ambassador.first_name[0] ?? "A") +
                      (r.ambassador.last_name[0] ?? "")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-semibold text-navy-900 truncate">
                        {r.ambassador.first_name} {r.ambassador.last_name}
                      </div>
                      {r.lastMessage && (
                        <div className="text-[11.5px] text-mute whitespace-nowrap">
                          {fmtDate(r.lastMessage.created_at)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p
                        className={
                          "text-[13px] truncate flex-1 " +
                          (r.unread > 0 ? "text-navy-900 font-medium" : "text-mute")
                        }
                      >
                        {r.lastMessage
                          ? `${r.lastMessage.from_admin ? "You: " : ""}${r.lastMessage.body}`
                          : "No messages yet — start the conversation."}
                      </p>
                      {r.unread > 0 && (
                        <span className="shrink-0 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold">
                          {r.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

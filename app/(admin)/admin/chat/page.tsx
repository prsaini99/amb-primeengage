import {
  AdminChatExperience,
} from "@/components/admin/admin-chat-experience";
import {
  type ChatListAmbassador,
  type ChatListRow,
} from "@/components/admin/chat-list";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat · Admin" };

export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const params = await searchParams;
  const initialSelectedId = params.with;

  const gate = await requireAdmin();
  if (!gate.ok) return null;

  const adminProfileId = gate.profileId;
  const sb = createAdminClient();

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

  const ambassadors = (ambsRes.data ?? []) as ChatListAmbassador[];
  const msgs = msgsRes.data ?? [];

  // Aggregate: per-ambassador, last message + unread count from them.
  const lastByAmb = new Map<string, ChatListRow["lastMessage"]>();
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

  const rows: ChatListRow[] = ambassadors.map((a) => ({
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
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
      <div>
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Chat
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          {totalUnread > 0
            ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"} across ${rows.filter((r) => r.unread > 0).length} thread${rows.filter((r) => r.unread > 0).length === 1 ? "" : "s"}.`
            : "All caught up."}
        </p>
      </div>

      <AdminChatExperience
        rows={rows}
        initialSelectedId={initialSelectedId}
        adminProfileId={adminProfileId}
      />
    </div>
  );
}

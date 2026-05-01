import { ChatThread, type ChatMessage } from "@/components/chat/chat-thread";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { getAdminProfile } from "@/lib/auth/get-admin-profile";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat · Yuvaah" };

export default async function AmbassadorChatPage() {
  const { profileId } = await requireAmbassador();
  const admin = await getAdminProfile();

  if (!admin) {
    return (
      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
        No admin is configured on this platform yet. Please reach out via email.
      </div>
    );
  }

  const sb = createAdminClient();
  const { data: rows } = await sb
    .from("amb_chat_messages")
    .select("id, sender_id, receiver_id, body, read_at, created_at")
    .or(
      `and(sender_id.eq.${profileId},receiver_id.eq.${admin.id}),and(sender_id.eq.${admin.id},receiver_id.eq.${profileId})`,
    )
    .order("created_at", { ascending: true })
    .limit(200);

  const initialMessages: ChatMessage[] = rows ?? [];

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Chat
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Direct line to the Prime Engage team. Replies usually within a day.
        </p>
      </div>

      <ChatThread
        selfProfileId={profileId}
        otherProfileId={admin.id}
        otherDisplayName={`${admin.first_name} ${admin.last_name}`.trim() || "Prime Engage team"}
        initialMessages={initialMessages}
      />
    </>
  );
}

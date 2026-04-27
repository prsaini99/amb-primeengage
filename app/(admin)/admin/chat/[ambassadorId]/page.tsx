import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ChatThread, type ChatMessage } from "@/components/chat/chat-thread";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminChatThreadPage({
  params,
}: {
  params: Promise<{ ambassadorId: string }>;
}) {
  const { ambassadorId } = await params;
  const gate = await requireAdmin();
  if (!gate.ok) return null;

  const sb = createAdminClient();

  const { data: ambassador } = await sb
    .from("amb_profiles")
    .select("id, first_name, last_name, email, role, status")
    .eq("id", ambassadorId)
    .maybeSingle();

  if (!ambassador || ambassador.role !== "ambassador") notFound();

  const { data: rows } = await sb
    .from("amb_chat_messages")
    .select("id, sender_id, receiver_id, body, read_at, created_at")
    .or(
      `and(sender_id.eq.${gate.profileId},receiver_id.eq.${ambassador.id}),and(sender_id.eq.${ambassador.id},receiver_id.eq.${gate.profileId})`,
    )
    .order("created_at", { ascending: true })
    .limit(200);

  const initialMessages: ChatMessage[] = rows ?? [];

  return (
    <>
      <Link
        href="/admin/chat"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900 mb-3"
      >
        <ArrowLeft size={14} /> All conversations
      </Link>

      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-navy-900">
          {ambassador.first_name} {ambassador.last_name}
        </h1>
        <p className="text-[13px] text-mute mt-0.5 font-mono">{ambassador.email}</p>
      </div>

      <ChatThread
        selfProfileId={gate.profileId}
        otherProfileId={ambassador.id}
        otherDisplayName={`${ambassador.first_name} ${ambassador.last_name}`.trim()}
        initialMessages={initialMessages}
      />
    </>
  );
}

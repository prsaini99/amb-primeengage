"use client";

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";

import {
  AdminChatList,
  type ChatListRow,
} from "@/components/admin/chat-list";
import { ChatThread, type ChatMessage } from "@/components/chat/chat-thread";

/**
 * Top-level admin chat shell. The server component fetches the ambassador
 * list (with last-message previews + unread counts) ONCE and passes it
 * here. From that point on, conversation selection is client-side React
 * state — clicking an ambassador swaps the right pane instantly without a
 * server round-trip. The selected thread's messages are fetched on demand
 * via /api/chat/messages.
 *
 * URL is kept in sync via history.replaceState so refreshing or copying
 * the link preserves the selection (server reads `?with=<id>` and passes
 * it as `initialSelectedId`).
 */
export function AdminChatExperience({
  rows,
  initialSelectedId,
  adminProfileId,
}: {
  rows: ChatListRow[];
  initialSelectedId?: string;
  adminProfileId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialSelectedId,
  );

  // Validate the selectedId still matches a row whenever rows change (after
  // a router.refresh from markRead, etc). If it's gone (deleted ambassador,
  // unlikely), drop the selection.
  useEffect(() => {
    if (selectedId && !rows.some((r) => r.ambassador.id === selectedId)) {
      setSelectedId(undefined);
    }
  }, [rows, selectedId]);

  function selectAmbassador(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    // Update the URL without triggering a Next router navigation. The
    // server component would otherwise re-fetch everything, defeating the
    // whole point of client-side selection.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/admin/chat?with=${id}`);
    }
  }

  const selectedAmbassador = selectedId
    ? rows.find((r) => r.ambassador.id === selectedId)?.ambassador ?? null
    : null;

  return (
    <div className="flex-1 min-h-[500px] rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden flex">
      <aside className="w-[320px] shrink-0 border-r border-line">
        <AdminChatList
          rows={rows}
          selectedId={selectedId}
          onSelect={selectAmbassador}
        />
      </aside>
      <main className="flex-1 min-w-0">
        {selectedAmbassador ? (
          // `key` forces full remount of ConversationPane when the
          // ambassador swaps — clears messages state, restarts polling,
          // re-runs markRead on the new thread.
          <ConversationPane
            key={selectedAmbassador.id}
            ambassador={selectedAmbassador}
            adminProfileId={adminProfileId}
          />
        ) : (
          <EmptyChatState hasAny={rows.length > 0} />
        )}
      </main>
    </div>
  );
}

/**
 * Right-pane content for a selected ambassador. Fetches the initial
 * messages on mount, then hands off to ChatThread (which polls + handles
 * sends + markRead on its own).
 *
 * While fetching, renders a header-only skeleton with the ambassador's
 * name so the click feels instant — only the message list area shows the
 * "Loading…" state.
 */
function ConversationPane({
  ambassador,
  adminProfileId,
}: {
  ambassador: { id: string; first_name: string; last_name: string };
  adminProfileId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(null);
    fetch(`/api/chat/messages?with=${encodeURIComponent(ambassador.id)}`)
      .then(async (res) => {
        const raw = await res.text();
        let json: { messages?: ChatMessage[]; error?: string } = {};
        if (raw) {
          try {
            json = JSON.parse(raw);
          } catch {
            throw new Error(`HTTP ${res.status}: ${raw.slice(0, 120)}`);
          }
        }
        if (!res.ok || json.error) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setMessages(json.messages ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [ambassador.id]);

  if (messages === null) {
    return <ConversationLoading ambassador={ambassador} error={error} />;
  }

  return (
    <ChatThread
      embedded
      selfProfileId={adminProfileId}
      otherProfileId={ambassador.id}
      otherDisplayName={`${ambassador.first_name} ${ambassador.last_name}`.trim()}
      initialMessages={messages}
    />
  );
}

function ConversationLoading({
  ambassador,
  error,
}: {
  ambassador: { first_name: string; last_name: string };
  error: string | null;
}) {
  return (
    <div className="flex flex-col h-full">
      <header className="px-5 py-4 border-b border-line">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
          Chat
        </p>
        <h2 className="font-display text-lg font-semibold text-navy-900 mt-1">
          {`${ambassador.first_name} ${ambassador.last_name}`.trim()}
        </h2>
      </header>
      <div className="flex-1 flex items-center justify-center">
        {error ? (
          <p className="text-[13px] text-amber-500 text-center px-6">
            Couldn't load messages: {error}
          </p>
        ) : (
          <p className="text-[13px] text-mute">Loading messages…</p>
        )}
      </div>
    </div>
  );
}

function EmptyChatState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="h-14 w-14 rounded-full bg-paper grid place-items-center mb-4">
        <MessageSquare size={22} className="text-mute" />
      </div>
      <p className="text-[14px] text-navy-900 font-semibold">
        {hasAny ? "Pick a conversation" : "No Yuvaah Club members yet"}
      </p>
      <p className="text-[13px] text-mute mt-1 max-w-xs">
        {hasAny
          ? "Choose a member from the left to view messages and reply."
          : "Approve some applications to start chatting."}
      </p>
    </div>
  );
}

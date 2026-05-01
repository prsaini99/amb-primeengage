"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Send } from "lucide-react";

const POLL_INTERVAL_MS = 5_000;
const MAX_BODY_CHARS = 4000;

export type ChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

/**
 * Bidirectional chat panel — used by both ambassador (/dashboard/chat) and
 * admin (/admin/chat/[ambassadorId]). Polls /api/chat/messages every 5s
 * while the tab is visible; pauses when hidden; resumes + immediately
 * refetches on focus.
 *
 * On mount: marks all unread messages from `otherProfileId` as read.
 * When new messages arrive while the user is looking, marks them read too.
 *
 * Phase 1 deliberately doesn't use Supabase Realtime — polling keeps infra
 * simple and "near real-time" (5s lag) is acceptable per the user spec.
 */
export function ChatThread({
  selfProfileId,
  otherProfileId,
  otherDisplayName,
  initialMessages,
  embedded = false,
}: {
  selfProfileId: string;
  otherProfileId: string;
  otherDisplayName: string;
  initialMessages: ChatMessage[];
  /**
   * When `true`, drops the outer card chrome (rounded / bg / ring / fixed
   * height) so the parent layout can wrap the thread in a custom container —
   * used by the admin's WhatsApp-style chat layout where the thread sits
   * inside a larger split-pane card.
   */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastTimestamp = messages.length
    ? messages[messages.length - 1].created_at
    : "";

  const markRead = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: otherProfileId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { marked?: number }
        | null;
      // If we actually flipped any rows, re-render the surrounding server
      // components so e.g. the admin's chat-list sidebar updates its
      // unread badge counts. No-op for ambassador (single thread, nothing
      // to refresh visually).
      if (json && typeof json.marked === "number" && json.marked > 0) {
        router.refresh();
      }
    } catch {
      // best-effort; the next poll cycle will retry implicitly
    }
  }, [otherProfileId, router]);

  const refetchTail = useCallback(async () => {
    try {
      const params = new URLSearchParams({ with: otherProfileId });
      if (lastTimestamp) params.set("after", lastTimestamp);
      const res = await fetch(`/api/chat/messages?${params}`);
      if (!res.ok) return;
      const json = (await res.json()) as { messages: ChatMessage[] };
      if (json.messages.length === 0) return;
      setMessages((prev) => mergeUnique(prev, json.messages));
      // New messages from the other party → mark them read.
      const incoming = json.messages.some((m) => m.sender_id === otherProfileId);
      if (incoming) await markRead();
    } catch {
      // transient network errors are acceptable for polling
    }
  }, [otherProfileId, lastTimestamp, markRead]);

  // Initial mark-as-read on mount + auto-scroll to bottom.
  useEffect(() => {
    void markRead();
  }, [markRead]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Visibility-aware polling: setInterval only fires while visible.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        if (!document.hidden) void refetchTail();
      }, POLL_INTERVAL_MS);
    }
    function stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        start();
        void refetchTail();
      }
    }
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetchTail]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (text.length > MAX_BODY_CHARS) {
      setError(`Message is too long (max ${MAX_BODY_CHARS} chars).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiver_id: otherProfileId, body: text }),
        });
        const raw = await res.text();
        let json: { message?: ChatMessage; error?: string } = {};
        if (raw) {
          try {
            json = JSON.parse(raw);
          } catch {
            setError(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
            return;
          }
        }
        if (!res.ok || json.error || !json.message) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        setMessages((prev) => mergeUnique(prev, [json.message!]));
        setDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const containerCls = embedded
    ? "flex flex-col h-full"
    : "flex flex-col h-[calc(100vh-12rem)] min-h-[440px] rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden";

  return (
    <div className={containerCls}>
      <header className="px-5 py-4 border-b border-line">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute">
          Chat
        </p>
        <h2 className="font-display text-lg font-semibold text-navy-900 mt-1">
          {otherDisplayName}
        </h2>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-[13px] text-mute text-center py-10">
            No messages yet. Say hi.
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === selfProfileId;
          const showDate =
            i === 0 ||
            new Date(m.created_at).toDateString() !==
              new Date(messages[i - 1].created_at).toDateString();
          return (
            <div key={m.id}>
              {showDate && (
                <p className="text-center text-[11px] text-mute my-3 uppercase tracking-wider font-semibold">
                  {formatDayLabel(m.created_at)}
                </p>
              )}
              <div className={"flex " + (mine ? "justify-end" : "justify-start")}>
                <div
                  className={
                    "max-w-[78%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap " +
                    (mine
                      ? "bg-navy-900 text-white rounded-tr-md"
                      : "bg-paper text-ink rounded-tl-md ring-1 ring-line")
                  }
                >
                  {m.body}
                  <div
                    className={
                      "mt-1 text-[10.5px] " +
                      (mine ? "text-white/60" : "text-mute")
                    }
                  >
                    {formatTime(m.created_at)}
                    {mine && m.read_at && " · read"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={send}
        className="border-t border-line px-4 py-3 bg-paper/50 space-y-2"
      >
        {error && (
          <div className="flex items-start gap-2 text-[12.5px] text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 ring-1 ring-amber-500/30">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline (standard chat UX).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e as unknown as React.FormEvent);
              }
            }}
            placeholder={`Message ${otherDisplayName}…`}
            rows={1}
            disabled={pending}
            maxLength={MAX_BODY_CHARS}
            suppressHydrationWarning
            className="flex-1 resize-none rounded-2xl bg-paper-2 ring-1 ring-line px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 max-h-32"
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-50"
            title="Send (Enter)"
          >
            <Send size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}

function mergeUnique(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

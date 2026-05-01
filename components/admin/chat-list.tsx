"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { fmtDate } from "@/components/admin/table";

export type ChatListAmbassador = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type ChatListRow = {
  ambassador: ChatListAmbassador;
  lastMessage: { body: string; created_at: string; from_admin: boolean } | null;
  unread: number;
};

/**
 * Left pane of the admin chat layout. Renders a search input + scrollable
 * list of ambassador conversations. Filtering is client-side over the full
 * list (Phase 1 cardinality is small; this is faster than ?q= round-trips).
 *
 * Selection is also client-side — clicking a row calls onSelect(id) which
 * updates the parent's React state and the URL (via history.replaceState),
 * with no full server-component re-render. This makes the swap feel
 * instant.
 */
export function AdminChatList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ChatListRow[];
  selectedId?: string;
  onSelect: (ambassadorId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = `${r.ambassador.first_name} ${r.ambassador.last_name}`.toLowerCase();
      if (name.includes(q)) return true;
      if (r.ambassador.email.toLowerCase().includes(q)) return true;
      if (r.lastMessage?.body.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [rows, query]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-line shrink-0">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-mute pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search name, email, message…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            suppressHydrationWarning
            className="w-full pl-9 pr-3 h-9 rounded-lg bg-paper ring-1 ring-line text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-[13px] text-mute text-center">
            {query
              ? "No matches."
              : "No approved ambassadors yet."}
          </li>
        )}
        {filtered.map((r) => {
          const selected = r.ambassador.id === selectedId;
          return (
            <li key={r.ambassador.id}>
              <button
                type="button"
                onClick={() => onSelect(r.ambassador.id)}
                className={
                  "w-full text-left flex items-center gap-3 px-4 py-3 transition-colors border-b border-line " +
                  (selected
                    ? "bg-amber-500/10"
                    : "hover:bg-paper")
                }
              >
                <div className="h-10 w-10 rounded-full brand-gradient text-white grid place-items-center text-[12px] font-semibold uppercase shrink-0">
                  {(r.ambassador.first_name[0] ?? "A") +
                    (r.ambassador.last_name[0] ?? "")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-semibold text-[13.5px] text-navy-900 truncate">
                      {r.ambassador.first_name} {r.ambassador.last_name}
                    </div>
                    {r.lastMessage && (
                      <div className="text-[10.5px] text-mute whitespace-nowrap font-mono">
                        {fmtDate(r.lastMessage.created_at)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p
                      className={
                        "text-[12.5px] truncate flex-1 " +
                        (r.unread > 0 && !selected
                          ? "text-navy-900 font-medium"
                          : "text-mute")
                      }
                    >
                      {r.lastMessage
                        ? `${r.lastMessage.from_admin ? "You: " : ""}${r.lastMessage.body}`
                        : "No messages yet"}
                    </p>
                    {r.unread > 0 && !selected && (
                      <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                        {r.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

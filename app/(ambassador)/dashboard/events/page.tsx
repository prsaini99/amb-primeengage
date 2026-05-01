import Link from "next/link";

import { fmtDate } from "@/components/admin/table";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events · Yuvaah" };

export default async function AmbassadorEventsPage() {
  await requireAmbassador();
  const sb = createAdminClient();

  const { data: events, error } = await sb
    .from("amb_events")
    .select("id, title, body, cover_image_url, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Events
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Updates and announcements from the team.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      )}

      {!error && (!events || events.length === 0) && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-10 text-center">
          <p className="text-[14px] text-mute">No events yet. Check back soon.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {events?.map((e) => (
          <Link
            key={e.id}
            href={`/dashboard/events/${e.id}`}
            className="group rounded-2xl bg-paper-2 ring-1 ring-line shadow-soft hover:ring-navy-800/30 hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col h-[400px]"
          >
            {/* 70 / 30 split: cover gets 280px of the 400px total so it's
                visually dominant; the 120px content strip carries date +
                title + Read more. Body excerpt lives on the detail page only. */}
            <div className="h-[280px] bg-paper overflow-hidden shrink-0">
              {e.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.cover_image_url}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full brand-gradient opacity-90" />
              )}
            </div>
            <div className="p-4 flex-1 flex flex-col overflow-hidden">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mute">
                {fmtDate(e.created_at)}
              </p>
              <h2 className="font-display text-[16px] font-semibold text-navy-900 leading-tight mt-1.5 group-hover:text-amber-500 transition-colors line-clamp-2">
                {e.title}
              </h2>
              <span className="mt-auto text-[12px] font-semibold text-navy-800 group-hover:text-amber-500 transition-colors">
                Read more →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

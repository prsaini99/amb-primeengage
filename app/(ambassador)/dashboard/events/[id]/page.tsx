import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { fmtDate } from "@/components/admin/table";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AmbassadorEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAmbassador();
  const sb = createAdminClient();

  const { data: event } = await sb
    .from("amb_events")
    .select("id, title, body, cover_image_url, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  return (
    <article className="max-w-3xl mx-auto">
      <Link
        href="/dashboard/events"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900 mb-3"
      >
        <ArrowLeft size={14} /> All events
      </Link>

      <header className="mb-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-mute">
          {fmtDate(event.created_at)}
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-navy-900 mt-2 leading-tight">
          {event.title}
        </h1>
      </header>

      {event.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.cover_image_url}
          alt=""
          className="w-full aspect-video object-cover rounded-2xl ring-1 ring-line mb-6"
        />
      )}

      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8">
        <p className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
          {event.body}
        </p>
      </div>
    </article>
  );
}

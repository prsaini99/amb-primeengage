import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { fmtDate } from "@/components/admin/table";
import { EventForm } from "@/components/admin/event-form";
import { DangerDeleteButton } from "@/components/admin/danger-delete-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateEvent, deleteEvent } from "@/app/actions/events";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();

  const { data: event } = await sb
    .from("amb_events")
    .select("id, title, body, cover_image_url, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();

  const updateAction = updateEvent.bind(null, event.id);
  const deleteAction = deleteEvent.bind(null, event.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to events
        </Link>
        <h1 className="font-display text-3xl font-semibold text-navy-900 mt-3">
          {event.title}
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Posted {fmtDate(event.created_at)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
              Edit
            </h3>
            <EventForm
              mode="edit"
              action={updateAction}
              initial={{
                title: event.title,
                body: event.body,
                cover_image_url: event.cover_image_url,
              }}
            />
          </div>
        </section>

        <aside>
          <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-mute mb-4">
              Danger zone
            </h3>
            <DangerDeleteButton
              action={deleteAction}
              confirmMessage="Delete this event permanently? Ambassadors will no longer see it."
              label="Delete event"
              busyLabel="Deleting…"
              redirectTo="/admin/events"
            />
            <p className="mt-3 text-[12.5px] text-mute leading-relaxed">
              Deletion is permanent — no archive. Cover image is left in
              storage; sweep separately if disk hygiene matters.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

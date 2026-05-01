import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EventForm } from "@/components/admin/event-form";
import { createEvent } from "@/app/actions/events";

export const metadata = { title: "New event · Admin" };

export default function NewEventPage() {
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
          New event
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Visible to all approved Yuvaah Club members as soon as it's saved.
        </p>
      </div>

      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8 max-w-3xl">
        <EventForm mode="create" action={createEvent} />
      </div>
    </div>
  );
}

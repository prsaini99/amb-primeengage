import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ActivityForm } from "@/components/admin/activity-form";
import { createActivity } from "@/app/actions/activities";

export const metadata = { title: "New activity · Admin" };

export default function NewActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/activities"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to activities
        </Link>
        <h1 className="font-display text-3xl font-semibold text-navy-900 mt-3">
          New activity
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Yuvaah Club members will see this in their dashboard once it's saved
          and the deadline is in the future.
        </p>
      </div>

      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8 max-w-3xl">
        <ActivityForm mode="create" action={createActivity} />
      </div>
    </div>
  );
}

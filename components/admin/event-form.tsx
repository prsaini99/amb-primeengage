"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Save } from "lucide-react";

import type { EventFormResult } from "@/app/actions/events";

type Mode =
  | {
      mode: "create";
      action: (
        prev: EventFormResult | null,
        fd: FormData,
      ) => Promise<EventFormResult | null>;
    }
  | {
      mode: "edit";
      action: (
        prev: EventFormResult | null,
        fd: FormData,
      ) => Promise<EventFormResult | null>;
      initial: {
        title: string;
        body: string;
        cover_image_url: string | null;
      };
    };

export function EventForm(props: Mode) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    EventFormResult | null,
    FormData
  >(props.action, null);

  const initial = props.mode === "edit" ? props.initial : null;
  const [removeCover, setRemoveCover] = useState(false);

  useEffect(() => {
    if (state && state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-5">
      <Field label="Title">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={initial?.title ?? ""}
          disabled={pending}
          suppressHydrationWarning
          className={inputCls}
        />
      </Field>

      <Field label="Body" hint="Plain text. Line breaks are preserved when displayed.">
        <textarea
          name="body"
          required
          rows={10}
          defaultValue={initial?.body ?? ""}
          disabled={pending}
          suppressHydrationWarning
          className={inputCls + " resize-y min-h-[220px] font-mono text-[13px] leading-relaxed"}
        />
      </Field>

      <Field label="Cover image (optional)" hint="JPEG / PNG / WebP, ≤5 MB.">
        <input
          name="cover_image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          suppressHydrationWarning
          className="block w-full text-[13px] text-mute file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-navy-900 file:text-white file:text-[12.5px] file:font-semibold hover:file:bg-navy-800 disabled:opacity-50"
        />
      </Field>

      {props.mode === "edit" && initial?.cover_image_url && (
        <div className="flex items-center gap-3 rounded-xl bg-paper ring-1 ring-line p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={initial.cover_image_url}
            alt="Current cover"
            className="h-12 w-16 rounded-md object-cover ring-1 ring-line"
          />
          <div className="flex-1 text-[13px] text-mute">Current cover.</div>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-mute">
            <input
              name="remove_cover"
              type="checkbox"
              checked={removeCover}
              onChange={(e) => setRemoveCover(e.target.checked)}
              disabled={pending}
              suppressHydrationWarning
            />
            Remove
          </label>
        </div>
      )}

      {state && !state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state && state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-cyan-500 bg-cyan-50 rounded-xl px-4 py-3 ring-1 ring-cyan-300/60">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>Saved.</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
        >
          <Save size={15} />
          {pending
            ? props.mode === "create" ? "Creating…" : "Saving…"
            : props.mode === "create" ? "Create event" : "Save changes"}
        </button>
        <Link
          href="/admin/events"
          className="text-[13px] text-mute hover:text-navy-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  "w-full mt-2 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] text-mute mt-1.5 block">{hint}</span>}
    </label>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Upload } from "lucide-react";

import {
  uploadGalleryImage,
  type GalleryFormResult,
} from "@/app/actions/gallery";

export function GalleryUploadForm() {
  const [state, action, pending] = useActionState<
    GalleryFormResult | null,
    FormData
  >(uploadGalleryImage, null);

  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Image
        </span>
        <input
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          disabled={pending}
          suppressHydrationWarning
          className="mt-2 block w-full text-[13px] text-mute file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-navy-900 file:text-white file:text-[12.5px] file:font-semibold hover:file:bg-navy-800 disabled:opacity-50"
        />
        <span className="text-[12px] text-mute mt-1.5 block">
          JPEG / PNG / WebP, ≤5 MB.
        </span>
      </label>

      <label className="block">
        <span className="text-[12px] font-semibold text-mute uppercase tracking-wide">
          Caption (optional)
        </span>
        <input
          name="caption"
          type="text"
          maxLength={500}
          disabled={pending}
          suppressHydrationWarning
          className="w-full mt-2 rounded-xl bg-paper-2 ring-1 ring-line px-4 py-3 text-[14.5px] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
        />
      </label>

      {state && !state.ok && (
        <div className="flex items-start gap-2.5 text-[13px] text-amber-500 bg-amber-500/10 rounded-xl px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 text-[13.5px] font-semibold rounded-full bg-amber-500 hover:bg-amber-400 text-white shadow-soft disabled:opacity-60"
        >
          <Upload size={15} />
          {pending ? "Uploading…" : "Upload"}
        </button>
        <Link
          href="/admin/gallery"
          className="text-[13px] text-mute hover:text-navy-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

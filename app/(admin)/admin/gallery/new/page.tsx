import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { GalleryUploadForm } from "@/components/admin/gallery-upload-form";

export const metadata = { title: "Upload to gallery · Admin" };

export default function NewGalleryUploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/gallery"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mute hover:text-navy-900"
        >
          <ArrowLeft size={14} /> Back to gallery
        </Link>
        <h1 className="font-display text-3xl font-semibold text-navy-900 mt-3">
          Upload image
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Visible to all approved Yuvaah Club members as soon as it's uploaded.
        </p>
      </div>

      <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 md:p-8 max-w-xl">
        <GalleryUploadForm />
      </div>
    </div>
  );
}

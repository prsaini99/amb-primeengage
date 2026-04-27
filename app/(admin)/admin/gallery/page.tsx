import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeading, fmtDate } from "@/components/admin/table";
import { DangerDeleteButton } from "@/components/admin/danger-delete-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteGalleryImage } from "@/app/actions/gallery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery · Admin" };

export default async function AdminGalleryPage() {
  const sb = createAdminClient();
  const { data: images, error } = await sb
    .from("amb_gallery")
    .select("id, image_url, caption, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <>
        <PageHeading title="Gallery" subtitle="Failed to load gallery." />
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Gallery"
        subtitle="Images visible to all approved ambassadors."
        actions={
          <Link
            href="/admin/gallery/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-amber-500 text-white text-[12.5px] font-semibold hover:bg-amber-400"
          >
            <Plus size={14} /> Upload
          </Link>
        }
      />

      {(!images || images.length === 0) && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-10 text-center">
          <p className="text-[14px] text-mute">
            No images yet.{" "}
            <Link
              href="/admin/gallery/new"
              className="text-navy-800 font-semibold hover:text-amber-500"
            >
              Upload the first one →
            </Link>
          </p>
        </div>
      )}

      {images && images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden flex flex-col"
            >
              <div className="aspect-square bg-paper relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.image_url}
                  alt={img.caption ?? ""}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <div className="p-3 flex-1 flex flex-col">
                {img.caption && (
                  <p className="text-[13px] text-ink line-clamp-2">{img.caption}</p>
                )}
                <p className="text-[11.5px] text-mute mt-1">
                  {fmtDate(img.created_at)}
                </p>
                <div className="mt-3 pt-3 border-t border-line">
                  <DangerDeleteButton
                    action={deleteGalleryImage.bind(null, img.id)}
                    confirmMessage="Delete this image? The file is also removed from storage."
                    label="Delete"
                    busyLabel="Deleting…"
                    size="sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery · Ambassador" };

export default async function AmbassadorGalleryPage() {
  await requireAmbassador();
  const sb = createAdminClient();

  const { data: images, error } = await sb
    .from("amb_gallery")
    .select("id, image_url, caption, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Gallery
        </h1>
        <p className="text-[13.5px] text-mute mt-1">
          Highlights from the Ambassador Club.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-6 text-[14px] text-amber-500">
          {error.message}
        </div>
      )}

      {!error && (!images || images.length === 0) && (
        <div className="rounded-2xl bg-paper-2 ring-1 ring-line p-10 text-center">
          <p className="text-[14px] text-mute">No images yet.</p>
        </div>
      )}

      {images && images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <figure
              key={img.id}
              className="group rounded-2xl bg-paper-2 ring-1 ring-line overflow-hidden"
            >
              <div className="aspect-square bg-paper relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.image_url}
                  alt={img.caption ?? ""}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                />
              </div>
              {img.caption && (
                <figcaption className="px-3 py-3 text-[13px] text-ink line-clamp-2">
                  {img.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </>
  );
}

import Image from "next/image";

/**
 * `size` is the rendered logo height in px. Width scales to the source aspect
 * ratio. Height/width are applied via inline `style` (not Tailwind height
 * utilities) so they reliably beat Tailwind v4 Preflight's `img { height: auto }`
 * — otherwise the logo falls back to its full intrinsic size and overflows.
 */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <Image
      src="/Prime Engage Logo new transparent bg.png"
      alt="Prime Engage"
      width={size * 4}
      height={size * 4}
      priority
      sizes="(max-width: 768px) 200px, 512px"
      style={{ height: size, width: "auto" }}
    />
  );
}

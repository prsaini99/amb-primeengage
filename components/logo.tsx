import Image from "next/image";

/**
 * `size` is a rendered height in px.
 * `mobileSize` (optional) overrides size below the md breakpoint — handy for
 * the header, where the desktop logo is deliberately large.
 */
export function Logo({
  size = 44,
  mobileSize,
}: {
  size?: number;
  mobileSize?: number;
}) {
  const cssVars: Record<string, string> = {
    "--logo-h": `${size}px`,
  };
  if (mobileSize) cssVars["--logo-h-mobile"] = `${mobileSize}px`;

  return (
    <Image
      src="/Prime Engage Logo new transparent bg.png"
      alt="Prime Engage"
      width={size * 4}
      height={size * 4}
      priority
      sizes="(max-width: 768px) 200px, 512px"
      className={
        mobileSize
          ? "h-[var(--logo-h-mobile)] md:h-[var(--logo-h)] w-auto"
          : "h-[var(--logo-h)] w-auto"
      }
      style={cssVars as React.CSSProperties}
    />
  );
}

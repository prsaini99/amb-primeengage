"use client";

import { useRouter } from "next/navigation";

/**
 * A table row that navigates to `href` on click or Enter/Space.
 * Used to make admin list rows behave like links while keeping the table
 * server-rendered (the cells are passed through as children).
 */
export function ClickableRow({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer hover:bg-paper/60 focus:bg-paper/60 outline-none transition-colors"
    >
      {children}
    </tr>
  );
}

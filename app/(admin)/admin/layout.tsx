import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ClipboardList, Users, Megaphone, ImageIcon, MessageSquare, ShoppingBag, Receipt, LogOut, Bell, Trophy, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

/**
 * Admin shell — visual scaffolding ported verbatim from primeengage's
 * app/admin/(protected)/layout.tsx. Auth rewired:
 *   - primeengage uses isAdminAuthenticated() (cookie basic-auth, separate
 *     from Supabase). Irrelevant here.
 *   - We use the Supabase session (cookie) + JWT app_metadata.role check.
 *     proxy.ts already enforces this; the layout check is belt-and-suspenders
 *     for direct server-to-page paths that skip the proxy (e.g. RSC fetches
 *     inside the same layer).
 */
export const dynamic = "force-dynamic";

const nav = [
  { href: "/admin/applications", label: "Applications", icon: Users },
  { href: "/admin/activities", label: "Activities", icon: ClipboardList },
  { href: "/admin/events", label: "Events", icon: Megaphone },
  { href: "/admin/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/admin/chat", label: "Chat", icon: MessageSquare },
  { href: "/admin/products", label: "Products", icon: ShoppingBag },
  { href: "/admin/orders", label: "Orders", icon: Receipt },
  { href: "/admin/tiers", label: "Tiers", icon: Trophy },
  { href: "/admin/quizzes", label: "Quizzes", icon: HelpCircle },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role !== "admin") redirect("/dashboard");

  const displayName =
    (user.user_metadata as { name?: string } | null)?.name ??
    user.email?.split("@")[0] ??
    "admin";

  return (
    <div className="min-h-screen bg-paper flex">
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r border-line bg-paper-2 sticky top-0 h-screen">
        <div className="p-5 border-b border-line">
          <Logo size={48} />
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] text-ink/80 hover:text-navy-900 hover:bg-paper font-medium transition-colors"
            >
              <Icon size={16} className="text-mute" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <form action={signOut} className="p-3 border-t border-line">
          <div className="rounded-xl bg-paper p-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full brand-gradient text-white grid place-items-center text-[12px] font-semibold uppercase">
                {displayName.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-navy-900 truncate">
                  {displayName}
                </div>
                <div className="text-[11px] text-mute truncate">Signed in</div>
              </div>
              <button
                type="submit"
                className="p-1.5 text-mute hover:text-navy-900"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </form>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-paper/80 backdrop-blur border-b border-line">
          <div className="px-6 md:px-8 h-14 flex items-center justify-between">
            <div className="text-[13px] text-mute">
              <Link href="/" className="hover:text-navy-800">
                Prime Engage
              </Link>
              <span className="mx-2">/</span>
              <span className="text-navy-900 font-semibold">admin</span>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-lg hover:bg-paper-2 text-mute">
                <Bell size={16} />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

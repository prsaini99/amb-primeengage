import Link from "next/link";
import { LayoutDashboard, ClipboardList, Megaphone, ImageIcon, MessageSquare, ShoppingBag, Receipt, LogOut, Bell } from "lucide-react";

import { Logo } from "@/components/logo";
import { requireAmbassador } from "@/lib/auth/require-ambassador";
import { signOut } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/activities", label: "Activities", icon: ClipboardList },
  { href: "/dashboard/events", label: "Events", icon: Megaphone },
  { href: "/dashboard/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/store", label: "Store", icon: ShoppingBag },
  { href: "/dashboard/orders", label: "My orders", icon: Receipt },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAmbassador();
  const displayName = `${profile.first_name} ${profile.last_name}`.trim();

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
                {(profile.first_name[0] ?? "A") + (profile.last_name[0] ?? "")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-navy-900 truncate">
                  {displayName || profile.email}
                </div>
                <div className="text-[11px] text-mute truncate">
                  Ambassador
                </div>
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
              <span className="text-navy-900 font-semibold">Ambassador Club</span>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Theses", path: "/theses" },
  { label: "Feed", path: "/feed" },
  { label: "Track Record", path: "/track-record" },
  { label: "Positions", path: "/book" },
  { label: "Community", path: "/community" },
  { label: "Leaderboard", path: "/leaderboard" },
  { label: "Help", path: "/help" },
] as const;

function tabIsActive(pathname: string, path: string) {
  if (path === "/theses") {
    if (pathname === "/theses") return true;
    if (pathname.startsWith("/theses/") && !pathname.startsWith("/theses/archive")) {
      return /^\/theses\/[^/]+$/.test(pathname);
    }
    return false;
  }
  if (pathname === path) return true;
  return pathname.startsWith(`${path}/`);
}

export function AppSubNav() {
  const pathname = usePathname() || "";

  return (
    <nav className="no-print border-b border-white/[0.06]" aria-label="App sections">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const active = tabIsActive(pathname, tab.path);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]",
                active && "bg-white/[0.08] text-zinc-100",
                !active && "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: { label: string; path: string; match: (p: string) => boolean }[] = [
  { label: "Theses", path: "/theses", match: (p) => p === "/theses" || p.startsWith("/theses/") },
  { label: "Feed", path: "/feed", match: (p) => p === "/feed" || p.startsWith("/feed/") },
  { label: "Positions", path: "/book", match: (p) => p === "/book" || p.startsWith("/book/") },
  { label: "Community", path: "/community", match: (p) => p.startsWith("/community") },
  { label: "Leaderboard", path: "/leaderboard", match: (p) => p.startsWith("/leaderboard") },
  { label: "Help", path: "/help", match: (p) => p.startsWith("/help") },
];

export function AppSubNav() {
  const pathname = usePathname() || "";

  return (
    <div className="border-b border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[12px] transition-colors",
                active ? "bg-white/[0.08] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

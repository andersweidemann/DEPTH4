"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function AppTopBar({ alertsSlot }: { alertsSlot?: ReactNode }) {
  const { logout, user } = useAuth();
  const bell = alertsSlot ?? <ThesisAlertsBell />;

  return (
    <header className="border-b border-white/[0.06]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/theses" className="flex min-w-0 items-center gap-2">
            <svg width={18} height={18} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M1 4h16M1 9h11M1 14h7" stroke="url(#grad-app-topbar)" strokeWidth={2.5} strokeLinecap="round" />
              <defs>
                <linearGradient id="grad-app-topbar" x1="1" y1="4" x2="17" y2="14" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f59e0b" />
                  <stop offset="1" stopColor="#dc2626" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-[12px] font-semibold tracking-tight text-zinc-100">DEPTH4</span>
            <span className="ml-1 hidden text-[10px] uppercase tracking-[0.18em] text-zinc-500 md:inline">
              YOUR MACRO THESIS ENGINE
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
            aria-label="Settings"
          >
            <GearIcon className="h-4 w-4" />
          </button>

          <div className="[&_button]:flex [&_button]:h-8 [&_button]:w-8 [&_button]:items-center [&_button]:justify-center [&_button]:rounded-md [&_button]:text-zinc-400 [&_button]:ring-0 [&_button]:hover:bg-white/[0.06] [&_button]:hover:text-zinc-200">
            {bell}
          </div>

          <span className="text-[12px] text-zinc-400" aria-label="Current tier">
            {user?.tier ?? "Free"}
          </span>

          <button
            type="button"
            onClick={() => void logout()}
            className={cn(
              "text-[12px] text-zinc-400 transition-colors hover:text-zinc-200",
              "min-h-8 px-0 py-1",
            )}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { ThesesSettingsMenu } from "@/components/thesis-engine-v2/ThesesSettingsMenu";

export function AppTopBar({ alertsSlot }: { alertsSlot?: ReactNode }) {
  const { logout, user } = useAuth();
  const bell = alertsSlot ?? <ThesisAlertsBell />;

  return (
    <header className="no-print border-b border-white/[0.06]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/theses"
            className="flex min-w-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
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
            <span className="ml-1 hidden text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:inline">
              YOUR MACRO THESIS ENGINE
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <ThesesSettingsMenu className="no-print" />

          <div className="no-print [&_button]:flex [&_button]:h-8 [&_button]:w-8 [&_button]:items-center [&_button]:justify-center [&_button]:rounded-md [&_button]:text-zinc-400 [&_button]:ring-0 [&_button]:hover:bg-white/[0.06] [&_button]:hover:text-zinc-200 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-slate-400 [&_button]:focus-visible:ring-offset-2 [&_button]:focus-visible:ring-offset-[#0c0c0e]">
            {bell}
          </div>

          <span className="text-[12px] text-zinc-400" aria-label="Current tier">
            {user?.tier ?? "Free"}
          </span>

          <button
            type="button"
            onClick={() => void logout()}
            className={cn(
              "text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm",
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

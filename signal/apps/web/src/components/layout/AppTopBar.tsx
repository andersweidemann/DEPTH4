"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";
import { V2_PLAN_LABEL, V2_PLAN_ORDER } from "@/lib/thesis-engine-v2/plan";
import { useMemo, useState } from "react";
import { InsiderFlowRadarButton, InsiderFlowPanel } from "@/components/thesis-engine-v2/InsiderFlowPanel";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";

export function AppTopBar({ alertsSlot }: { alertsSlot?: ReactNode }) {
  const { plan } = useV2Plan();
  const liveOpt = useThesisLiveOptional();
  const [insiderOpen, setInsiderOpen] = useState(false);
  const planLabel = V2_PLAN_LABEL[plan] ?? plan;
  const tierLabel = plan === V2_PLAN_ORDER[0] ? "Free Tier" : planLabel;

  const radarState = useMemo(() => {
    const latest = liveOpt?.insiderFlowAnomalies?.[0];
    if (!latest) return "none" as const;
    return latest.patternType === "BULL_LEAK" ? ("bull" as const) : ("bear" as const);
  }, [liveOpt?.insiderFlowAnomalies]);

  const bell = alertsSlot ?? <ThesisAlertsBell />;

  return (
    <>
      <header className="border-b border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href="/theses" className="flex min-w-0 items-center gap-2">
            <svg className="h-[18px] w-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path
                d="M2 5h14M2 9h10M2 13h6"
                stroke="url(#depth4-logo-gradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="depth4-logo-gradient" x1="2" y1="5" x2="16" y2="13" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#f59e0b" />
                  <stop offset="1" stopColor="#ef4444" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-[12px] font-semibold tracking-tight text-zinc-100">DEPTH4</span>
            <span className="ml-2 hidden text-[10px] uppercase tracking-[0.18em] text-zinc-500 md:inline">
              Your macro thesis engine
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <InsiderFlowRadarButton onClick={() => setInsiderOpen(true)} state={radarState} />
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <div className="flex items-center">{bell}</div>
            <span className="hidden text-[12px] text-zinc-400 sm:inline" aria-label="Current tier">
              {tierLabel}
            </span>
            <LogoutButton
              buttonClassName={cn(
                "text-[12px] text-zinc-400 hover:text-zinc-200",
                "min-h-8 px-2 py-1 sm:min-h-0",
              )}
            />
          </div>
        </div>
      </header>
      <InsiderFlowPanel open={insiderOpen} onClose={() => setInsiderOpen(false)} />
    </>
  );
}

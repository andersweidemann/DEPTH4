"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CommunityThesis } from "@/lib/thesis-engine-v2/types";
import { formatThesisMicroLabel, getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import { isFollowed, toggleFollow } from "@/components/thesis-engine-v2/community-store";
import { ProbabilityBar } from "@/components/thesis-engine-v2/ProbabilityBar";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/thesis-engine-v2/Tooltip";

function badgeTone(b: string) {
  // Text-only badges (avoid decorative filled pills).
  if (/top\s*5%/i.test(b)) return "text-amber-200/90";
  if (/top\s*10%/i.test(b)) return "text-zinc-300";
  return "text-zinc-400";
}

export function CommunityThesisCard({ item }: { item: CommunityThesis }) {
  const [followed, setFollowed] = useState(false);
  useEffect(() => setFollowed(isFollowed(item.id)), [item.id]);

  return (
    <div className="rounded-none bg-zinc-900/25 p-4 sm:p-4.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/theses/${item.thesisSlug}`}
            className="block hover:text-amber-200/90"
          >
            {formatThesisMicroLabel(item.microLabel) ? (
              <span className="block text-[10px] font-medium leading-snug text-zinc-500">{formatThesisMicroLabel(item.microLabel)}</span>
            ) : null}
            <span className="mt-0.5 block truncate text-[12px] font-semibold leading-snug text-zinc-100">{getThesisDisplayTitle(item)}</span>
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            <span className="text-zinc-300">{item.author}</span>
            <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", badgeTone(item.reputationBadge))}>
              {item.reputationBadge}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="tabular-nums">{item.followers.toLocaleString()} followers</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFollowed(toggleFollow(item.id))}
          className={cn(
            "rounded-md px-3 py-2 text-[11px] font-semibold ring-1 transition-colors",
            followed
              ? "bg-zinc-800 text-zinc-200 ring-zinc-600/40 hover:bg-zinc-700"
              : "bg-amber-500/12 text-amber-200 ring-amber-500/25 hover:bg-amber-500/18",
          )}
        >
          {followed ? "Following" : "Follow"}
        </button>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-600">
          Community snapshot · not live thesis conviction
        </p>
        <div className="flex items-center gap-3">
          <Tooltip label="Leaderboard-style mock field for the community rail. Open the thesis for DEPTH4 Thesis conviction (Clean + Messy) and resolution paths.">
            <span className="text-[14px] font-semibold tabular-nums text-amber-200/90">{item.probability}%</span>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <ProbabilityBar value={item.probability} />
          </div>
          <Tooltip label="Structural score on this card (0–100). Not the same as Thesis conviction on the thesis page.">
            <span className="text-[11px] tabular-nums text-zinc-500">score {item.scoreTotal}/100</span>
          </Tooltip>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
        <span>{item.lastUpdated}</span>
        <span className="text-zinc-500">{followed ? "Following" : "Tap Follow to track"}</span>
      </div>
    </div>
  );
}


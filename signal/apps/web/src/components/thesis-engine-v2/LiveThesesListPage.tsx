"use client";

import Link from "next/link";
import { useState } from "react";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import { useRequireFeature } from "@/lib/thesis-engine-v2/feature-gate";
import { upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { putUserThesisToSupabase } from "@/lib/thesis-engine-v2/sync-user-thesis-client";
import { cn } from "@/lib/utils";

function StarOutlineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ProbColumn({ mispricing }: { mispricing: number }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-2">
        <div className="h-1 w-12 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full w-[75%] rounded-full bg-amber-500/60" />
        </div>
        <span className="text-[12px] font-medium text-zinc-300">
          75<span className="text-zinc-500">%</span>
        </span>
      </div>
      <p className="mt-1 text-[10px] text-zinc-600">Mispricing {mispricing}/100</p>
    </div>
  );
}

const TABLE_GRID = "grid grid-cols-[1fr_80px_80px_80px_40px] gap-3";

export function LiveThesesListPage() {
  const requireFeature = useRequireFeature();
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "starred" | "ready">("all");
  const [starredCount] = useState(0);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Live theses</h1>
          <p className="mt-1 text-[13px] text-zinc-400">Tracks macro events the market hasn&apos;t priced in yet.</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-[12px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          onClick={() => requireFeature("createPrivateTheses", "new-thesis", () => setCreateOpen(true))}
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New thesis
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
              filter === "all" ? "bg-white/[0.08] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
            )}
            onClick={() => setFilter("all")}
          >
            All theses
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] transition-colors",
              filter === "starred"
                ? "bg-white/[0.08] font-medium text-zinc-100"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
            )}
            onClick={() => setFilter("starred")}
          >
            Starred ({starredCount})
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] transition-colors",
              filter === "ready"
                ? "bg-white/[0.08] font-medium text-zinc-100"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
            )}
            onClick={() => setFilter("ready")}
          >
            Ready only
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Asset class</label>
            <select className="rounded-md border border-white/[0.08] bg-zinc-900/50 px-2 py-1 text-[11px] text-zinc-300 focus:outline-none">
              <option>All</option>
              <option>Equity</option>
              <option>Rates</option>
              <option>FX</option>
              <option>Commodities</option>
              <option>Crypto</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Sort</label>
            <select className="rounded-md border border-white/[0.08] bg-zinc-900/50 px-2 py-1 text-[11px] text-zinc-300 focus:outline-none">
              <option>Most recent update</option>
              <option>Highest probability</option>
              <option>Biggest move</option>
            </select>
          </div>
        </div>
      </div>

      {/* Focus */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Focus</p>
          <p className="text-[10px] text-zinc-600">Ready / Active · curated macro map</p>
        </div>

        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={cn(
                TABLE_GRID,
                "border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600",
              )}
            >
              <span>Thesis</span>
              <span className="text-right">Prob</span>
              <span>Status</span>
              <span className="text-right">Update</span>
              <span />
            </div>

            <FocusRow
              slug="war-peace-gold-short"
              micro="War risk keeps gold bid"
              title="Gold will fall as a peace deal removes the war-risk premium the market has been paying within weeks."
              dir="short"
              lane="ready"
              why="Why now: Peace odds crossed the line where gold should fade — but the metal has not repriced yet."
              mispricing={81}
              statusUi="ready"
              updated="23m ago"
            />
            <FocusRow
              slug="fed-pivot-delayed-tlt-weakness"
              micro="Rates stay higher for longer"
              title="TLT will stay under pressure as the Fed delays rate cuts longer than the market expects this year."
              dir="short"
              lane="active"
              why="Why now: The next two prints can move the first-cut date fast — bond longs are early."
              mispricing={69}
              statusUi="active"
              updated="45m ago"
            />
            <FocusRow
              slug="opec-unity-fracturing"
              micro="Oil supply unity cracking"
              title="USO will find a floor as OPEC holds barrels tight while US shale slows this quarter."
              dir="long"
              lane="ready"
              why="Why now: Data is starting to show shale fatigue while OPEC keeps the story tight."
              mispricing={54}
              statusUi="ready"
              updated="4h ago"
            />
            <FocusRow
              slug="us-defense-repricing-rtx-lmt"
              micro="Wars drive steady defense spend"
              title="RTX will rerate higher as named Pentagon contracts lock in its order book this quarter."
              dir="long"
              lane="ready"
              why="Why now: Award dates are close enough that the next press release can gap the stock."
              mispricing={61}
              statusUi="ready"
              updated="12m ago"
            />
            <FocusRow
              slug="china-stimulus-copper-long"
              micro="China\u2019s build-out lifts copper"
              title="Copper will stay bid as China\u2019s infrastructure buildout keeps demand above available supply."
              dir="long"
              lane="ready"
              why="Why now: Policy tone flipped while HG is still priced for no help."
              mispricing={63}
              statusUi="ready"
              updated="50m ago"
            />
            <FocusRow
              slug="eu-tech-crackdown-megacap"
              micro="Ad machine funding AI dreams"
              title="META will underperform as EU platform rules tighten within months."
              dir="short"
              lane="active"
              why="Why now: Enforcement is entering the binding phase — that is when the downside path pays."
              mispricing={47}
              statusUi="active"
              updated="2h ago"
            />
          </div>
        </div>
      </div>

      {/* Monitor */}
      <div className="mt-10">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Monitor</p>
          <p className="text-[10px] text-zinc-600">Watching / forming · plus next ready/active on deck</p>
        </div>
        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
          Two to four high-signal rows: setup watches first, then the next ready/active names after the Focus window (active
          before ready). If only one strict watch exists, we borrow from the bottom of the Focus strip so the list still feels
          alive — those names show only here (not duplicated in Focus).
        </p>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={cn(
                TABLE_GRID,
                "border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600",
              )}
            >
              <span>Thesis</span>
              <span className="text-right">Prob</span>
              <span>Status</span>
              <span className="text-right">Update</span>
              <span />
            </div>

            <MonitorRow1 />
            <MonitorRow2 />
          </div>
        </div>
      </div>

      <CreateThesisModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(t) => {
          upsertUserThesis(t);
          void putUserThesisToSupabase(t).then((r) => {
            if (!r.ok && r.error !== "sign_in_required") {
              console.warn("[theses] Could not sync thesis to server:", r.error);
            }
          });
        }}
      />
    </>
  );
}

function DirBadge({ dir }: { dir: "short" | "long" }) {
  if (dir === "short") {
    return (
      <span className="rounded-full border border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-400">
        short
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-400">
      long
    </span>
  );
}

function LaneBadge({ lane }: { lane: "ready" | "active" }) {
  if (lane === "ready") {
    return (
      <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
        ready
      </span>
    );
  }
  return (
    <span className="rounded-full border border-zinc-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
      active
    </span>
  );
}

function FocusRow({
  slug,
  micro,
  title,
  dir,
  lane,
  why,
  mispricing,
  statusUi,
  updated,
}: {
  slug: string;
  micro: string;
  title: string;
  dir: "short" | "long";
  lane: "ready" | "active";
  why: string;
  mispricing: number;
  statusUi: "ready" | "active";
  updated: string;
}) {
  return (
    <div className={cn(TABLE_GRID, "items-start border-b border-white/[0.06] py-4")}>
      <div>
        <p className="text-[10px] text-zinc-500">{micro}</p>
        <Link
          href={`/theses/${slug}`}
          className="mt-0.5 block text-[13px] font-medium text-zinc-100 hover:text-amber-200/90"
        >
          {title}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <DirBadge dir={dir} />
          <LaneBadge lane={lane} />
        </div>
        <p className="mt-1.5 max-w-lg text-[11px] leading-relaxed text-zinc-500">{why}</p>
      </div>
      <ProbColumn mispricing={mispricing} />
      <div>
        {statusUi === "ready" ? (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            Active
          </span>
        )}
      </div>
      <div className="text-right">
        <span className="text-[11px] text-zinc-500">{updated}</span>
      </div>
      <div className="flex justify-end">
        <button type="button" className="text-zinc-600 transition-colors hover:text-amber-400" aria-label="Star thesis">
          <StarOutlineIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MonitorRow1() {
  return (
    <div className={cn(TABLE_GRID, "items-start border-b border-white/[0.06] py-4")}>
      <div>
        <Link
          href="/theses/ai-capex-squeeze-qqq-rotation"
          className="block text-[13px] font-medium text-zinc-100 hover:text-amber-200/90"
        >
          AI costs before AI profits
        </Link>
        <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-zinc-400">
          QQQ will underperform as AI spending squeezes margins before revenue catches up this earnings season.
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded-full border border-zinc-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
            watch
          </span>
          <span className="text-[10px] text-zinc-500">Watching</span>
        </div>
        <p className="mt-1.5 max-w-lg text-[11px] leading-relaxed text-zinc-500">
          Why now: Earnings season is the clock. The tape prices smooth AI wins; the prints can say otherwise.
        </p>
      </div>
      <ProbColumn mispricing={50} />
      <div>
        <span className="inline-flex items-center gap-1 text-[10px] uppercase text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
          Watching
        </span>
      </div>
      <div className="text-right">
        <span className="text-[11px] text-zinc-500">3h ago</span>
      </div>
      <div className="flex justify-end">
        <button type="button" className="text-zinc-600 transition-colors hover:text-amber-400" aria-label="Star thesis">
          <StarOutlineIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MonitorRow2() {
  return (
    <div className={cn(TABLE_GRID, "items-start border-b border-white/[0.06] py-4")}>
      <div>
        <Link
          href="/theses/strait-hormuz-oil-long"
          className="block text-[13px] font-medium text-zinc-100 hover:text-amber-200/90"
        >
          Gulf routes keep oil on edge
        </Link>
        <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-zinc-400">
          USO will rerate higher as Hormuz chokepoint risk spikes within weeks.
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded-full border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-400">
            long
          </span>
          <span className="rounded-full border border-zinc-600/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400">
            active
          </span>
        </div>
        <p className="mt-1.5 max-w-lg text-[11px] leading-relaxed text-zinc-500">
          Why now: Routing warnings are stacking while crude still trades range-bound — that mismatch breaks fast.
        </p>
      </div>
      <ProbColumn mispricing={71} />
      <div>
        <span className="inline-flex items-center gap-1 text-[10px] uppercase text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
          Active
        </span>
      </div>
      <div className="text-right">
        <span className="text-[11px] text-zinc-500">1h ago</span>
      </div>
      <div className="flex justify-end">
        <button type="button" className="text-zinc-600 transition-colors hover:text-amber-400" aria-label="Star thesis">
          <StarOutlineIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

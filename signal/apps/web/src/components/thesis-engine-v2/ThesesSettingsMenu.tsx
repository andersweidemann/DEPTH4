"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useThesesPagePreferences } from "@/hooks/use-theses-page-preferences";
import type { ThesesSortMode, ThesesViewMode } from "@/lib/theses/theses-page-preferences";
import { cn } from "@/lib/utils";

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

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px] text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-white/20 bg-zinc-900 accent-[#E8473F]"
      />
      {label}
    </label>
  );
}

function RadioRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px] text-zinc-300">
      <input
        type="radio"
        checked={selected}
        onChange={onSelect}
        className="h-3.5 w-3.5 border-white/20 bg-zinc-900 accent-[#E8473F]"
      />
      {label}
    </label>
  );
}

export function ThesesSettingsMenu({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { prefs, updatePrefs, resetPrefs } = useThesesPagePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onThesesHub =
    pathname === "/theses" ||
    pathname.startsWith("/theses?") ||
    (pathname.startsWith("/theses/") && !pathname.startsWith("/theses/archive"));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!onThesesHub) return;
    if (prefs.viewMode === "list" && !pathname.includes("list=1")) {
      router.push("/theses?list=1");
    } else if (prefs.viewMode === "card" && pathname.includes("list=1")) {
      router.replace("/theses");
    }
  }, [prefs.viewMode, onThesesHub, pathname, router]);

  if (!onThesesHub) {
    return (
      <button
        type="button"
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500",
          className,
        )}
        aria-label="Settings (theses page only)"
        disabled
        title="Open /theses to use view and filter settings"
      >
        <GearIcon className="h-4 w-4 opacity-40" />
      </button>
    );
  }

  const setView = (viewMode: ThesesViewMode) => {
    updatePrefs({ viewMode });
    if (viewMode === "list") router.push("/theses?list=1");
    else if (viewMode === "card") router.replace("/theses");
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label="Theses settings"
        aria-expanded={open}
      >
        <GearIcon className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-white/[0.08] bg-[#111110] p-3 shadow-xl"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Settings</p>

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">View</p>
          <RadioRow label="Card view (map)" selected={prefs.viewMode === "card"} onSelect={() => setView("card")} />
          <RadioRow label="Compact list" selected={prefs.viewMode === "list"} onSelect={() => setView("list")} />
          <RadioRow
            label="Matrix view (map)"
            selected={prefs.viewMode === "matrix"}
            onSelect={() => updatePrefs({ viewMode: "matrix" })}
          />

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Filter</p>
          <CheckRow label="Show watching theses" checked={prefs.showWatching} onChange={(v) => updatePrefs({ showWatching: v })} />
          <CheckRow label="Show tradeable theses" checked={prefs.showTradeable} onChange={(v) => updatePrefs({ showTradeable: v })} />
          <CheckRow
            label="Show AI-generated theses"
            checked={prefs.showAiGenerated}
            onChange={(v) => updatePrefs({ showAiGenerated: v })}
          />
          <CheckRow
            label="Show user-created theses"
            checked={prefs.showUserCreated}
            onChange={(v) => updatePrefs({ showUserCreated: v })}
          />

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Sort</p>
          {(
            [
              ["edge", "By edge (highest first)"],
              ["quality", "By quality"],
              ["updated", "By last updated"],
              ["asset", "By asset (A–Z)"],
            ] as const
          ).map(([id, label]) => (
            <RadioRow
              key={id}
              label={label}
              selected={prefs.sort === id}
              onSelect={() => updatePrefs({ sort: id as ThesesSortMode })}
            />
          ))}

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Preferences</p>
          <CheckRow
            label="Auto-hide dismissed theses"
            checked={prefs.autoHideDismissed}
            onChange={(v) => updatePrefs({ autoHideDismissed: v })}
          />
          <CheckRow
            label="Show activity banner"
            checked={prefs.showActivityBanner}
            onChange={(v) => updatePrefs({ showActivityBanner: v })}
          />
          <CheckRow
            label="Sound on new thesis"
            checked={prefs.soundOnNewThesis}
            onChange={(v) => updatePrefs({ soundOnNewThesis: v })}
          />

          <button
            type="button"
            onClick={() => resetPrefs()}
            className="mt-3 w-full rounded border border-white/[0.08] px-2 py-1.5 text-[11px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
          >
            Reset all filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

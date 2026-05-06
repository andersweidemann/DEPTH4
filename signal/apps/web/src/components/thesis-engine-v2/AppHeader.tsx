import Link from "next/link";
import { cn } from "@/lib/utils";

export type ThesisNavTab = "theses" | "feed" | "book";

function DepthMark({ className }: { className?: string }) {
  // Minimal, institutional mark: 4 nodes with forward path.
  return (
    <svg
      viewBox="0 0 28 28"
      width="22"
      height="22"
      className={className}
      role="img"
      aria-label="DEPTH4 mark"
    >
      <path
        d="M6 20 L13 13 L18 16 L23 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <circle cx="6" cy="20" r="2.1" fill="currentColor" opacity="0.35" />
      <circle cx="13" cy="13" r="2.1" fill="currentColor" opacity="0.55" />
      <circle cx="18" cy="16" r="2.1" fill="currentColor" opacity="0.55" />
      <circle cx="23" cy="10" r="2.1" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

export function AppHeader({
  active,
  planLabel = "Pro",
  liveLine,
}: {
  active: ThesisNavTab;
  planLabel?: string;
  liveLine: string;
}) {
  const tab = (id: ThesisNavTab, href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active === id
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-500 hover:text-zinc-300",
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl px-5 pt-7 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DepthMark className="text-amber-500/90" />
              <div className="min-w-0">
                <p className="text-[18px] font-semibold tracking-tight text-zinc-100">DEPTH4</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Macro Thesis Engine
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-zinc-600">Trade four moves ahead</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">
              {planLabel}
            </span>
          </div>
        </div>
        <nav className="mt-6 flex flex-wrap items-center gap-1" aria-label="Primary">
          {tab("theses", "/theses", "Theses")}
          {tab("feed", "/feed-2", "Feed")}
          {tab("book", "/book-2", "Book")}
        </nav>
        <p className="mt-4 text-[11px] text-zinc-500">{liveLine}</p>
      </div>
    </header>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";

export type ThesisNavTab = "theses" | "feed" | "book";

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
      <div className="mx-auto max-w-3xl px-5 pt-8 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold tracking-tight text-zinc-100">DEPTH4</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Macro Thesis Engine
            </p>
            <p className="mt-2 text-[11px] text-zinc-600">Trade four moves ahead</p>
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

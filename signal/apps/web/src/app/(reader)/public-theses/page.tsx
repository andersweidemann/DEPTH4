import type { Metadata } from "next";
import Link from "next/link";
import { listDiscoverableTheses } from "@/lib/thesis-engine-v2/thesis-reader-discovery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public theses · DEPTH4",
  description:
    "Selected macro theses from DEPTH4 — tradable intelligence with cause, path, timing, and market implication.",
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    siteName: "DEPTH4",
    title: "Selected macro theses",
    description: "Curated public theses from the DEPTH4 macro intelligence engine.",
  },
};

function formatUpdated(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PublicThesesDiscoveryPage() {
  const theses = await listDiscoverableTheses();

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E8473F]">DEPTH4</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">Selected macro theses</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-zinc-500">
        Curated public theses — not an exhaustive archive. Each piece is chosen to represent tradable macro
        intelligence: cause, path, timing, and market implication.
      </p>

      {theses.length === 0 ? (
        <p className="mt-12 text-[13px] text-zinc-600">No theses are listed for discovery yet.</p>
      ) : (
        <ul className="mt-10 space-y-4">
          {theses.map((t) => (
            <li key={t.slug}>
              <Link
                href={t.readerHref}
                className="group block border border-white/[0.06] bg-zinc-900/25 px-5 py-4 transition-colors hover:border-[#E8473F]/25 hover:bg-zinc-900/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {t.labelDisplay ? (
                    <span className="rounded border border-white/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                      {t.labelDisplay}
                    </span>
                  ) : null}
                  {t.updatedAt ? (
                    <span className="text-[10px] text-zinc-600">{formatUpdated(t.updatedAt)}</span>
                  ) : null}
                </div>
                <h2 className="mt-2 text-[15px] font-semibold text-zinc-100 group-hover:text-[#E8473F]">
                  {t.title}
                </h2>
                {t.microLabel ? (
                  <p className="mt-1 text-[12px] font-medium text-zinc-500">{t.microLabel}</p>
                ) : null}
                <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-zinc-500">{t.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-12 text-[11px] text-zinc-600">
        Link-only theses are not shown here. Sharing a reader link does not automatically list a thesis on this
        page.
      </p>
    </div>
  );
}

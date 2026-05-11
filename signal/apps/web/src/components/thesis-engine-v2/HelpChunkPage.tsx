"use client";

import { useEffect, useState } from "react";
import type { HelpSection } from "@/types/help";

export function HelpChunkPage() {
  const [sections, setSections] = useState<HelpSection[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/help")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load help"))))
      .then((data: { sections?: HelpSection[]; lastUpdated?: string }) => {
        setSections(data.sections || []);
        setLastUpdated(data.lastUpdated || "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load help");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mx-auto mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-[14px] text-red-400">
          {error}{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-amber-400 hover:text-amber-300"
          >
            Retry
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-8 pb-16">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">On this page</p>
          <nav className="space-y-1">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block py-0.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Help center</h1>
        <p className="mt-1 text-[13px] text-zinc-400">How to use DEPTH4.</p>

        <nav className="mt-6 flex flex-nowrap gap-2 overflow-x-auto pb-2 lg:hidden" aria-label="On this page">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 py-1.5 text-[11px] text-zinc-300"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-10">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.content.map((paragraph, i) => (
                  <p key={i} className="text-[13px] leading-relaxed text-zinc-400">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-[11px] text-zinc-600">Last updated: {lastUpdated}</p>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function SubmitNewsPage() {
  const { isAuthenticated } = useAuth();
  const [url, setUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "DEPTH4 · Submit news";
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error("Sign in to submit news for analysis");
      return;
    }
    if (!url.trim() && !headline.trim() && !body.trim()) {
      toast.error("Add a URL, headline, or excerpt");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/news/submit", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, headline, body }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      toast.success(j.message ?? "Queued for analysis");
      setUrl("");
      setHeadline("");
      setBody("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-16">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Submit news</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-400">
          Paste a URL or headline DEPTH4 should analyze. Submissions join the evidence queue — check Feed and theses
          for mapping, not instant publication.
        </p>
        <p className="mt-3 text-[11px]">
          <Link href="/sources" className="text-zinc-500 hover:text-zinc-300">
            ← All sources
          </Link>
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 max-w-lg space-y-4">
        <label className="block">
          <span className="text-[11px] font-medium text-zinc-500">Article URL</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#111110] px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-[#E8473F]/40 focus:outline-none focus:ring-1 focus:ring-[#E8473F]/30"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-zinc-500">Headline (optional)</span>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#111110] px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-[#E8473F]/40 focus:outline-none focus:ring-1 focus:ring-[#E8473F]/30"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-zinc-500">Excerpt or notes (optional)</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-white/[0.08] bg-[#111110] px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-[#E8473F]/40 focus:outline-none focus:ring-1 focus:ring-[#E8473F]/30"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "rounded-md border border-[#E8473F]/30 bg-[#E8473F]/10 px-4 py-2 text-[12px] font-medium text-[#E8473F] transition-colors hover:bg-[#E8473F]/20 disabled:opacity-50",
          )}
        >
          {submitting ? "Queuing…" : "Submit for analysis"}
        </button>
        {!isAuthenticated ? (
          <p className="text-[11px] text-amber-400/90">Sign in required to submit.</p>
        ) : null}
      </form>
    </div>
  );
}

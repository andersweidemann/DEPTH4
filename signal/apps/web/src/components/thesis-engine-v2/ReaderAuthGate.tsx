"use client";

import Link from "next/link";
import { RouteGuard } from "@/components/RouteGuard";
import { thesisReaderPath } from "@/lib/thesis-engine-v2/thesis-reader-mode";

/** Login gate for private thesis reader routes (authenticated product path). */
export function ReaderAuthGate({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard requireAuth>
      {children}
    </RouteGuard>
  );
}

export function PrivateThesisReaderLoginPrompt({ slug }: { slug: string }) {
  const next = encodeURIComponent(thesisReaderPath(slug));
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E8473F]/80">Private thesis</p>
      <h1 className="mt-4 text-xl font-semibold text-zinc-50">Sign in to read</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-zinc-500">
        This thesis link is not publicly shared. Sign in to your DEPTH4 account, or ask the sender to enable public
        reader access.
      </p>
      <Link
        href={`/login?next=${next}`}
        className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-[#E8473F] px-6 text-sm font-medium text-white hover:bg-[#E8473F]/90"
      >
        Sign in
      </Link>
    </div>
  );
}

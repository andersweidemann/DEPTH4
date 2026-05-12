"use client";

import { useParams } from "next/navigation";
import { ThesisDetailClient } from "@/components/thesis-engine-v2/ThesisDetailClient";

/**
 * `/theses/[slug]` entry — must render under {@link ThesisLiveProvider} so evidence polling,
 * `registerEvidenceLogPollPriorityThesisId`, and scenario overrides from `thesis_evidence_log` apply
 * (user + catalog). The legacy chunk page only hit one-shot REST fetches and stayed on template triples.
 */
export function ThesisSlugDetailPage() {
  const params = useParams();
  const raw = params?.slug;
  const slug = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
  if (!slug) {
    return <p className="p-6 text-sm text-zinc-400">Missing thesis slug.</p>;
  }
  return <ThesisDetailClient slug={slug} layout="page" />;
}

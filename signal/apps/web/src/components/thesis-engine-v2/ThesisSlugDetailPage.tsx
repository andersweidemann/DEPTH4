"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { isThesisReaderViewSearchParam, thesisReaderPath } from "@/lib/thesis-engine-v2/thesis-reader-mode";
import { ThesisDetailClient } from "@/components/thesis-engine-v2/ThesisDetailClient";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";

/**
 * `/theses/[slug]` entry — must render under {@link ThesisLiveProvider} so evidence polling,
 * `registerEvidenceLogPollPriorityThesisId`, and scenario overrides from `thesis_evidence_log` apply
 * (user + catalog). The legacy chunk page only hit one-shot REST fetches and stayed on template triples.
 *
 * **Catalog DB header:** pass `public.theses` title / body / `scenario_probabilities` from the same
 * `/api/theses/catalog-titles` payload the provider hydrates — matches `loadThesisDetailBundleForApi` /
 * drawer wiring so full-page detail is not stuck on shipped-only defaults until evidence polls.
 */
export function ThesisSlugDetailPage({ readerMode = false }: { readerMode?: boolean }) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const live = useThesisLive();
  const raw = params?.slug;
  const slug = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
  const [dbBodyBySlug, setDbBodyBySlug] = useState<unknown | null>(null);

  const shippedCatalog = useMemo(() => (slug ? getThesisDetail(slug) : undefined), [slug]);

  const catalogHeader = useMemo(() => {
    if (!slug || !shippedCatalog) return null;
    const id = shippedCatalog.thesis.id;
    return {
      catalogDisplayTitle: live.catalogDbThesisTitles.get(id) ?? null,
      catalogMicroLabel: live.catalogDbThesisMicroLabels.get(id) ?? null,
      catalogBody: live.catalogDbThesisBodies.get(id) ?? null,
      catalogScenarioProbabilities: live.catalogDbThesisScenarioProbabilities.get(id) ?? null,
    };
  }, [
    slug,
    shippedCatalog,
    live.catalogDbThesisTitles,
    live.catalogDbThesisMicroLabels,
    live.catalogDbThesisBodies,
    live.catalogDbThesisScenarioProbabilities,
  ]);

  useEffect(() => {
    if (!slug || shippedCatalog) {
      setDbBodyBySlug(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/theses/${encodeURIComponent(slug)}/bundle`, { credentials: "include" });
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { body?: unknown };
        if (!cancelled && j.body != null) setDbBodyBySlug(j.body);
      } catch {
        // detail client also hydrates bundle
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, shippedCatalog]);

  useEffect(() => {
    if (readerMode || !slug) return;
    if (isThesisReaderViewSearchParam(searchParams?.get("view"))) {
      router.replace(thesisReaderPath(slug));
    }
  }, [readerMode, router, searchParams, slug]);

  if (!slug) {
    return <p className="p-6 text-sm text-zinc-400">Missing thesis slug.</p>;
  }

  const catalogBody = catalogHeader?.catalogBody ?? dbBodyBySlug ?? null;

  return (
    <ThesisDetailClient
      slug={slug}
      layout="page"
      readerMode={readerMode}
      catalogDisplayTitle={catalogHeader?.catalogDisplayTitle ?? null}
      catalogMicroLabel={catalogHeader?.catalogMicroLabel ?? null}
      catalogBody={catalogBody}
      catalogScenarioProbabilities={catalogHeader?.catalogScenarioProbabilities ?? null}
    />
  );
}

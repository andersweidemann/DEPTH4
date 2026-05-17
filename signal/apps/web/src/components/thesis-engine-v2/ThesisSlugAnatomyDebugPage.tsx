"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ThesisDetailClient } from "@/components/thesis-engine-v2/ThesisDetailClient";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { useAuth } from "@/contexts/AuthContext";
import { isThesisAnatomyDebugVisible } from "@/lib/thesis-engine-v2/thesis-anatomy-debug-access";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";

/**
 * `/theses/[slug]/debug` — internal anatomy inspection only (guarded).
 */
export function ThesisSlugAnatomyDebugPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const live = useThesisLive();
  const raw = params?.slug;
  const slug = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";

  const allowed = isThesisAnatomyDebugVisible({
    searchParamsDebug: searchParams?.get("debug"),
    userId: user?.id ?? null,
  });

  const catalogHeader = useMemo(() => {
    if (!slug) return null;
    const d = getThesisDetail(slug);
    if (!d) return null;
    const id = d.thesis.id;
    return {
      catalogDisplayTitle: live.catalogDbThesisTitles.get(id) ?? null,
      catalogMicroLabel: live.catalogDbThesisMicroLabels.get(id) ?? null,
      catalogBody: live.catalogDbThesisBodies.get(id) ?? null,
      catalogScenarioProbabilities: live.catalogDbThesisScenarioProbabilities.get(id) ?? null,
    };
  }, [
    slug,
    live.catalogDbThesisTitles,
    live.catalogDbThesisMicroLabels,
    live.catalogDbThesisBodies,
    live.catalogDbThesisScenarioProbabilities,
  ]);

  if (!slug) {
    return <p className="p-6 text-sm text-zinc-400">Missing thesis slug.</p>;
  }

  if (!allowed) {
    return (
      <div className="p-6">
        <p className="text-sm font-semibold text-zinc-200">Anatomy debug (internal)</p>
        <p className="mt-2 text-[12px] text-zinc-500">
          Add <code className="text-amber-200/90">?debug=1</code>, set{" "}
          <code className="text-amber-200/90">NEXT_PUBLIC_DEBUG_THESIS_PANEL=1</code>, or sign in as an operator user
          (<code className="text-amber-200/90">NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS</code>).
        </p>
        <Link href={`/theses/${slug}`} className="mt-4 inline-block text-[11px] text-amber-500/90 hover:underline">
          ← Back to thesis
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-2">
      <Link href={`/theses/${slug}`} className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-amber-500/90">
        ← Thesis detail
      </Link>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-500/90">
        Anatomy debug (internal) · {slug}
      </p>
      <div className="mt-6">
        <ThesisDetailClient
          slug={slug}
          layout="page"
          catalogDisplayTitle={catalogHeader?.catalogDisplayTitle ?? null}
          catalogMicroLabel={catalogHeader?.catalogMicroLabel ?? null}
          catalogBody={catalogHeader?.catalogBody ?? null}
          catalogScenarioProbabilities={catalogHeader?.catalogScenarioProbabilities ?? null}
          anatomyDebugForce
          anatomyDebugOnly
        />
      </div>
    </div>
  );
}

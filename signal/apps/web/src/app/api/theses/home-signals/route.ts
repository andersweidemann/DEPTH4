import { NextResponse } from "next/server";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import { loadCatalogEngineTheses } from "@/lib/theses/load-catalog-engine-theses";
import { thesisMapHomeRankScore } from "@/lib/theses/thesis-home-surfacing";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import type { ThesisHomeSignalsResponse } from "@/types/thesis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public catalog surfacing hint for /theses (highest-ranked seeded catalog thesis).
 * Does not require user auth — uses service role for a consistent read of seeded_system rows.
 */
export async function GET() {
  const sb = createServiceRoleClient();
  if (!sb) {
    console.error("[home-signals] missing Supabase service role env");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  try {
    const { catalogEngine, dbSurfacingByThesisId } = await loadCatalogEngineTheses(sb);

    let best: { thesisId: string; slug: string; thesisScore: number } | null = null;
    let bestScore = -Infinity;

    for (const t of catalogEngine) {
      const slug = t.slug?.trim() ?? "";
      if (!slug) continue;
      const pref = dbSurfacingByThesisId.get(t.id);
      const raw =
        typeof pref?.thesis_score === "number" && Number.isFinite(pref.thesis_score)
          ? pref.thesis_score
          : thesisMapHomeRankScore(t);
      const thesisScore = Math.round(raw);
      if (thesisScore > bestScore) {
        bestScore = thesisScore;
        best = { thesisId: t.id, slug, thesisScore };
      }
    }

    // No DB rows yet: still expose a stable catalog slug for UI (score from engine rank).
    if (!best && CATALOG_THESES.length) {
      const ranked = [...catalogEngine].sort((a, b) => thesisMapHomeRankScore(b) - thesisMapHomeRankScore(a));
      const t = ranked[0] ?? CATALOG_THESES[0];
      const slug = t.slug?.trim() ?? "";
      if (slug) {
        best = {
          thesisId: t.id,
          slug,
          thesisScore: Math.round(thesisMapHomeRankScore(t)),
        };
      }
    }

    const payload: ThesisHomeSignalsResponse = { catalogLeader: best };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[home-signals] catalog leader load failed", {
      message,
      catalogCount: CATALOG_THESES.length,
    });
    return NextResponse.json({ error: "catalog_leader_load_failed" }, { status: 500 });
  }
}

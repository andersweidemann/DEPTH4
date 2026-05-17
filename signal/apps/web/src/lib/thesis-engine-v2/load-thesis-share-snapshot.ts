import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { fetchCatalogThesisHeaderBySlug } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import {
  buildThesisShareSnapshot,
  type ThesisShareSnapshot,
} from "@/lib/thesis-engine-v2/thesis-share-metadata";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

const DEFAULT_SNAPSHOT: Omit<ThesisShareSnapshot, "slug"> = {
  title: "Macro thesis",
  ogTitle: "Macro thesis",
  description:
    "DEPTH4 maps macro headlines across four future states and surfaces where the market is still mispriced — tradable theses, not headline rewrites.",
  imageHeadline: "Macro intelligence thesis",
  imageSubline: "Four-level chain · mispricing · trade expression",
};

function mergeHeaderIntoThesis(thesis: Thesis, header: {
  title?: string | null;
  microLabel?: string | null;
  body?: unknown | null;
}): Thesis {
  let next = thesis;
  const t = (header.title ?? "").trim();
  const m = (header.microLabel ?? "").trim();
  if (t) next = { ...next, title: t };
  if (m) next = { ...next, microLabel: m };
  if (header.body !== undefined && header.body !== null) {
    next = mergeDbBodyIntoThesis(next, header.body);
  }
  return next;
}

function minimalThesisFromDbRow(row: {
  title?: unknown;
  micro_label?: unknown;
  body?: unknown;
}): Thesis | null {
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  const base: Thesis = {
    id: "share",
    slug: "",
    title,
    thesisStatement: title,
    asset: "—",
    direction: "watch",
    probability: 50,
    status: "active",
    probabilityRationale: "",
    whyNow: "",
    whatsUnpriced: "",
    trigger: "",
    trade: "",
    invalidation: "",
    horizon: "",
    advisoryAction: "hold",
    lastUpdated: "",
    theme: "macro",
    qualification: "theme",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "",
    scores: {
      driverStrength: 0,
      timeCompression: 0,
      marketMispricingScore: 0,
      tradeClarityScore: 0,
      triggerClarityScore: 0,
      total: 0,
    },
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [] },
    thesisOrigin: "ai_generated",
  };
  const micro = typeof row.micro_label === "string" ? row.micro_label.trim() : "";
  if (micro) base.microLabel = micro;
  return mergeDbBodyIntoThesis(base, row.body ?? null);
}

/**
 * Server-only snapshot for reader metadata / OG (presentation layer).
 * Uses catalog baseline + optional DB header; service role only when catalog miss.
 */
export async function loadThesisShareSnapshot(slug: string): Promise<ThesisShareSnapshot> {
  const s = slug.trim();
  if (!s) return { slug: s, ...DEFAULT_SNAPSHOT };

  const supabase = await createClient();
  const header = await fetchCatalogThesisHeaderBySlug(supabase, s);
  const catalog = getThesisDetail(s);

  if (catalog?.thesis) {
    const thesis = mergeHeaderIntoThesis(catalog.thesis, header);
    return buildThesisShareSnapshot(s, thesis, header.title ?? thesis.title);
  }

  const svc = createServiceRoleClient();
  const reader = svc ?? supabase;
  const { data } = await reader
    .from("theses")
    .select("title, micro_label, body")
    .eq("slug", s)
    .maybeSingle();

  if (data) {
    const thesis = minimalThesisFromDbRow(data as { title?: unknown; micro_label?: unknown; body?: unknown });
    if (thesis) {
      thesis.slug = s;
      return buildThesisShareSnapshot(s, thesis);
    }
  }

  return {
    slug: s,
    ...DEFAULT_SNAPSHOT,
    description: clampDefaultDescription(s),
  };
}

function clampDefaultDescription(slug: string): string {
  const human = slug.replace(/-/g, " ");
  return `DEPTH4 macro thesis on ${human} — cause, path, timing, and what the market is still mispricing.`;
}

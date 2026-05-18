/**
 * Phase 4F — Curated public thesis discovery (separate from link-only `reader_public_enabled`).
 */

import type { ThesisReaderPublishingContext } from "@/lib/thesis-engine-v2/thesis-reader-publishing-access";
import { canManageThesisReaderPublic } from "@/lib/thesis-engine-v2/thesis-reader-publishing-access";
import {
  parseThesisReaderPublicRow,
  resolveThesisReaderPublicRow,
  type ThesisReaderPublicRow,
} from "@/lib/thesis-engine-v2/thesis-reader-public";
import { buildThesisShareDescription } from "@/lib/thesis-engine-v2/thesis-share-metadata";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export type ReaderDiscoveryLabel = "featured" | "exemplar" | "curated" | "ai_generated";

export type ThesisReaderDiscoveryRow = ThesisReaderPublicRow & {
  reader_public_discoverable: boolean;
  reader_discovery_label: ReaderDiscoveryLabel | null;
  reader_discovery_priority: number;
  updated_at: string | null;
  title: string | null;
  micro_label: string | null;
};

export type PublicDiscoveryCard = {
  slug: string;
  title: string;
  description: string;
  microLabel: string | null;
  label: ReaderDiscoveryLabel | null;
  labelDisplay: string | null;
  updatedAt: string | null;
  thesisOrigin: string | null;
  readerHref: string;
};

const LABEL_DISPLAY: Record<ReaderDiscoveryLabel, string> = {
  featured: "Featured",
  exemplar: "Exemplar",
  curated: "Curated",
  ai_generated: "AI-generated",
};

const LABEL_TIER: Record<ReaderDiscoveryLabel, number> = {
  featured: 0,
  exemplar: 1,
  curated: 2,
  ai_generated: 3,
};

export function readerDiscoveryLabelDisplay(
  label: ReaderDiscoveryLabel | null,
): string | null {
  if (!label) return null;
  return LABEL_DISPLAY[label] ?? null;
}

export function parseReaderDiscoveryLabel(raw: unknown): ReaderDiscoveryLabel | null {
  if (raw === "featured" || raw === "exemplar" || raw === "curated" || raw === "ai_generated") {
    return raw;
  }
  return null;
}

export function parseThesisReaderDiscoveryRow(data: unknown): ThesisReaderDiscoveryRow | null {
  const base = parseThesisReaderPublicRow(data);
  if (!base) return null;
  const row = data as Record<string, unknown>;
  return {
    ...base,
    reader_public_discoverable: row.reader_public_discoverable === true,
    reader_discovery_label: parseReaderDiscoveryLabel(row.reader_discovery_label),
    reader_discovery_priority:
      typeof row.reader_discovery_priority === "number" && Number.isFinite(row.reader_discovery_priority)
        ? row.reader_discovery_priority
        : 0,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    title: typeof row.title === "string" ? row.title : null,
    micro_label: typeof row.micro_label === "string" ? row.micro_label : null,
  };
}

/** Same authority as public link sharing (4C.1 / 4E). */
export function canManageThesisReaderDiscovery(
  row: ThesisReaderPublicRow,
  ctx: ThesisReaderPublishingContext,
): boolean {
  return canManageThesisReaderPublic(row, ctx);
}

export function discoverySortCompare(a: ThesisReaderDiscoveryRow, b: ThesisReaderDiscoveryRow): number {
  const priA = a.reader_discovery_priority ?? 0;
  const priB = b.reader_discovery_priority ?? 0;
  if (priB !== priA) return priB - priA;

  const tierA = a.reader_discovery_label != null ? LABEL_TIER[a.reader_discovery_label] : 4;
  const tierB = b.reader_discovery_label != null ? LABEL_TIER[b.reader_discovery_label] : 4;
  if (tierA !== tierB) return tierA - tierB;

  const originRank = (o: string | null) => {
    if (o === "seeded_system") return 0;
    if (o === "user") return 1;
    if (o === "ai_generated") return 2;
    return 3;
  };
  const oa = originRank(a.thesis_origin);
  const ob = originRank(b.thesis_origin);
  if (oa !== ob) return oa - ob;

  const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
  const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
  return tb - ta;
}

function minimalThesisForDescription(row: ThesisReaderDiscoveryRow): Thesis {
  const title = (row.title ?? "Macro thesis").trim() || "Macro thesis";
  const micro = (row.micro_label ?? "").trim();
  return {
    id: row.id,
    slug: row.slug ?? "",
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
    microLabel: micro,
    oneLineSummary: micro,
  };
}

export function discoveryRowToCard(row: ThesisReaderDiscoveryRow): PublicDiscoveryCard | null {
  const slug = row.slug?.trim();
  if (!slug) return null;
  const thesis = minimalThesisForDescription(row);
  return {
    slug,
    title: thesis.title,
    description: buildThesisShareDescription(thesis),
    microLabel: row.micro_label,
    label: row.reader_discovery_label,
    labelDisplay: readerDiscoveryLabelDisplay(row.reader_discovery_label),
    updatedAt: row.updated_at,
    thesisOrigin: row.thesis_origin,
    readerHref: `/theses/${slug}/read`,
  };
}

export async function listDiscoverableTheses(): Promise<PublicDiscoveryCard[]> {
  const svc = createServiceRoleClient();
  if (!svc) return [];

  const { data, error } = await svc
    .from("theses")
    .select(
      "id, slug, title, micro_label, body, reader_public_enabled, reader_public_discoverable, reader_discovery_label, reader_discovery_priority, owner_user_id, thesis_origin, updated_at",
    )
    .eq("reader_public_enabled", true)
    .eq("reader_public_discoverable", true)
    .not("slug", "is", null);

  if (error || !data) return [];

  const rows = (data as unknown[])
    .map(parseThesisReaderDiscoveryRow)
    .filter((r): r is ThesisReaderDiscoveryRow => r != null)
    .sort(discoverySortCompare);

  const rawById = new Map(
    (data as Record<string, unknown>[]).map((d) => [String((d as { id?: string }).id ?? ""), d]),
  );

  const cards: PublicDiscoveryCard[] = [];
  for (const row of rows) {
    let enriched = row;
    const raw = rawById.get(row.id);
    const body = raw && typeof raw === "object" ? (raw as { body?: unknown }).body : null;
    if (body != null) {
      const t = minimalThesisForDescription(row);
      const merged = mergeDbBodyIntoThesis(t, body);
      enriched = { ...row, title: merged.title, micro_label: merged.microLabel ?? row.micro_label };
    }
    const card = discoveryRowToCard(enriched);
    if (card) cards.push(card);
  }
  return cards;
}

export async function fetchThesisReaderDiscoveryRow(
  slug: string,
): Promise<ThesisReaderDiscoveryRow | null> {
  const row = await resolveThesisReaderPublicRow(slug);
  if (!row) return null;

  const svc = createServiceRoleClient();
  if (!svc) {
    return {
      ...row,
      reader_public_discoverable: false,
      reader_discovery_label: null,
      reader_discovery_priority: 0,
      updated_at: null,
      title: null,
      micro_label: null,
    };
  }

  const { data, error } = await svc
    .from("theses")
    .select(
      "id, slug, title, micro_label, reader_public_enabled, reader_public_discoverable, reader_discovery_label, reader_discovery_priority, owner_user_id, thesis_origin, updated_at",
    )
    .eq("id", row.id)
    .maybeSingle();

  if (error || !data) {
    return {
      ...row,
      reader_public_discoverable: false,
      reader_discovery_label: null,
      reader_discovery_priority: 0,
      updated_at: null,
      title: null,
      micro_label: null,
    };
  }
  return parseThesisReaderDiscoveryRow(data);
}

export type SetThesisReaderDiscoveryResult = "ok" | "not_found" | "forbidden" | "requires_public";

export async function setThesisReaderDiscovery(
  slug: string,
  input: {
    discoverable: boolean;
    label?: ReaderDiscoveryLabel | null;
    priority?: number;
  },
  ctx: ThesisReaderPublishingContext,
): Promise<SetThesisReaderDiscoveryResult> {
  const row = await fetchThesisReaderDiscoveryRow(slug);
  if (!row) return "not_found";
  if (!canManageThesisReaderDiscovery(row, ctx)) return "forbidden";

  if (input.discoverable && !row.reader_public_enabled) return "requires_public";

  const svc = createServiceRoleClient();
  if (!svc) return "forbidden";

  const patch: Record<string, unknown> = {
    reader_public_discoverable: input.discoverable,
    updated_at: new Date().toISOString(),
  };

  if (input.discoverable) {
    if (input.label !== undefined) {
      patch.reader_discovery_label = input.label;
    }
    if (input.priority !== undefined) {
      patch.reader_discovery_priority = Math.max(0, Math.floor(input.priority));
    }
  } else {
    patch.reader_discovery_label = null;
    patch.reader_discovery_priority = 0;
  }

  const { error } = await svc.from("theses").update(patch).eq("id", row.id);
  if (error) return "forbidden";
  return "ok";
}

/** Public discovery index path — middleware allowlist. */
export function isPublicThesisDiscoveryPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return p === "/public-theses" || p.startsWith("/public-theses/");
}

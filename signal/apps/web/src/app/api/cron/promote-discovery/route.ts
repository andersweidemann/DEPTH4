import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

export const runtime = "nodejs";

const DEFAULT_ALLOWED_DOMAINS = [
  "policy",
  "earnings",
  "geopolitics",
  "credit",
  "commodities",
  "central_banking",
  /** Broad buckets for wire headlines that rarely match narrow taxonomy */
  "markets",
  "macro",
  "business",
  "world_news",
] as const;

const CANONICAL_DOMAIN_KEYS = new Set<string>(DEFAULT_ALLOWED_DOMAINS);

type ClusterRow = {
  id: string;
  signal_score: number | string | null;
  member_news_event_ids: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
  title_hint: string | null;
};

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** DB stores signal_score on 0–100 (see news-clustering). Env 0.65 → 65; 65 → 65. */
function minPromotionScoreThreshold(): number {
  const raw = Number(process.env.MIN_PROMOTION_SCORE ?? 0.65);
  if (!Number.isFinite(raw) || raw <= 0) return 65;
  if (raw <= 1) return raw * 100;
  return raw;
}

function dailyPromotionLimit(): number {
  const n = Number(process.env.DAILY_PROMOTION_LIMIT ?? 3);
  if (!Number.isFinite(n)) return 3;
  return clampInt(n, 1, 25);
}

function promotionFreshHours(): number {
  const n = Number(process.env.PROMOTION_FRESH_HOURS ?? 24);
  if (!Number.isFinite(n)) return 24;
  return clampInt(n, 1, 168);
}

/** Minimum clustered news rows to promote; internal testing often uses 1–2. */
function minPromotionMemberCount(): number {
  const n = Number(process.env.MIN_PROMOTION_MEMBER_COUNT ?? 3);
  if (!Number.isFinite(n)) return 3;
  return clampInt(n, 1, 10);
}

function promotionSkipDomainCheck(): boolean {
  return (process.env.PROMOTION_SKIP_DOMAIN_CHECK ?? "").trim() === "1";
}

/** If cluster metadata already inferred any domain tag, allow promotion without allowlist overlap. */
function promotionAllowAnyInferredDomain(): boolean {
  return (process.env.PROMOTION_ALLOW_ANY_INFERRED_DOMAIN ?? "").trim() === "1";
}

function parseAllowedDomains(raw: string | undefined): Set<string> {
  const s = (raw ?? DEFAULT_ALLOWED_DOMAINS.join(",")).trim();
  return new Set(
    s
      .split(",")
      .map((x) => x.trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(Boolean),
  );
}

function numScore(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function memberCount(ids: unknown): number {
  if (!Array.isArray(ids)) return 0;
  return ids.filter((x) => typeof x === "string" && x.length > 0).length;
}

/**
 * Infer canonical domains from cluster metadata.categories (news category strings)
 * and optional metadata.domain.
 */
function inferDomainsFromCluster(metadata: Record<string, unknown>): Set<string> {
  const domains = new Set<string>();
  const single = metadata.domain;
  if (typeof single === "string" && single.trim()) {
    domains.add(single.trim().toLowerCase().replace(/\s+/g, "_"));
  }

  const cats = metadata.categories;
  if (!Array.isArray(cats)) return domains;

  for (const raw of cats) {
    const s = String(raw ?? "").toLowerCase().trim();
    if (!s) continue;

    const normCat = s.replace(/-/g, "_").replace(/\s+/g, "_");
    if (CANONICAL_DOMAIN_KEYS.has(normCat)) {
      domains.add(normCat);
      continue;
    }

    if (/\b(fed|ecb|boj|boe|central\s*bank|monetary\s*policy|fomc|policy\s*rate|interest\s*rates?)\b/.test(s)) {
      domains.add("central_banking");
    }
    if (/\b(earnings|eps|guidance|quarterly|revenue|profit\s*warning)\b/.test(s)) {
      domains.add("earnings");
    }
    if (/\b(geopolit|sanction|conflict|nato|ukraine|middle\s*east|defense|war|election\s*fraud)\b/.test(s)) {
      domains.add("geopolitics");
    }
    if (/\b(credit|default|high\s*yield|junk|loan|refinance|bankruptcy)\b/.test(s)) {
      domains.add("credit");
    }
    if (/\b(commodit|oil|gold|opec|copper|lng|grain|metals|energy)\b/.test(s)) {
      domains.add("commodities");
    }
    if (/\b(policy|legislat|congress|senate|regulation|white\s*house|tariff|trade\s*deal|executive\s*order)\b/.test(s)) {
      domains.add("policy");
    }
    if (/\b(markets|stocks|equities|nasdaq|s&p|djia|wall\s*street|traders?|rally|selloff)\b/.test(s)) {
      domains.add("markets");
    }
    if (/\b(economy|gdp|inflation|cpi|pce|jobs|payroll|unemployment|recession|macro)\b/.test(s)) {
      domains.add("macro");
    }
    if (/\b(business|corporate|merger|acquisition|ceo|bankruptcy\s*filing)\b/.test(s)) {
      domains.add("business");
    }
    if (/\b(global|international|world|overseas|foreign|diplomat)\b/.test(s)) {
      domains.add("world_news");
    }
  }

  return domains;
}

function passesAllowedDomain(metadata: Record<string, unknown>, allowed: Set<string>): boolean {
  const inferred = inferDomainsFromCluster(metadata);
  for (const d of Array.from(inferred)) {
    if (allowed.has(d)) return true;
  }
  return false;
}

function passesDomainGate(metadata: Record<string, unknown>, allowed: Set<string>): boolean {
  if (promotionSkipDomainCheck()) return true;
  if (promotionAllowAnyInferredDomain()) {
    const inferred = inferDomainsFromCluster(metadata);
    if (inferred.size > 0) return true;
  }
  return passesAllowedDomain(metadata, allowed);
}

function isClusterRow(x: unknown): x is ClusterRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string";
}

async function runPromoteDiscovery() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const minScore = minPromotionScoreThreshold();
  const minMembers = minPromotionMemberCount();
  const limit = dailyPromotionLimit();
  const freshH = promotionFreshHours();
  const allowedDomains = parseAllowedDomains(process.env.PROMOTION_ALLOWED_DOMAINS);
  const skipDomain = promotionSkipDomainCheck();
  const anyInferredOk = promotionAllowAnyInferredDomain();
  const freshCutoff = new Date(Date.now() - freshH * 3_600_000).toISOString();

  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;

  const { data: rawRows, error: qErr } = await admin
    .from("thesis_discovery_clusters")
    .select("id,signal_score,member_news_event_ids,metadata,created_at,title_hint,status")
    .eq("status", "candidate")
    .gte("created_at", freshCutoff)
    .order("signal_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (qErr) {
    return NextResponse.json({ ok: false, error: qErr.message, stage: "load_candidates" }, { status: 400 });
  }

  const rows = (rawRows ?? []).filter(isClusterRow);
  const promotedIds: string[] = [];
  let skippedCount = 0;
  const passing: ClusterRow[] = [];

  for (const row of rows) {
    const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    const score = numScore(row.signal_score);
    const nMembers = memberCount(row.member_news_event_ids);

    if (score < minScore) {
      skippedCount += 1;
      console.info("[promote-discovery] skip_low_score", { id: row.id, score, minScore });
      continue;
    }
    if (nMembers < minMembers) {
      skippedCount += 1;
      console.info("[promote-discovery] skip_few_members", { id: row.id, nMembers, minMembers });
      continue;
    }
    if (!passesDomainGate(meta, allowedDomains)) {
      skippedCount += 1;
      console.info("[promote-discovery] skip_domain", {
        id: row.id,
        inferred: Array.from(inferDomainsFromCluster(meta)),
        categories: meta.categories,
      });
      continue;
    }

    passing.push(row);
  }

  const skippedOverLimit = Math.max(0, passing.length - limit);
  skippedCount += skippedOverLimit;

  const toPromote = passing.slice(0, limit);

  for (const row of toPromote) {
    const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    const domainsHit = Array.from(inferDomainsFromCluster(meta)).filter((d) => allowedDomains.has(d));
    const score = numScore(row.signal_score);
    const nMembers = memberCount(row.member_news_event_ids);

    const promotionMeta = {
      at: new Date().toISOString(),
      reason: "strict_gates",
      signal_score: score,
      domains: domainsHit.length ? domainsHit : Array.from(inferDomainsFromCluster(meta)),
      member_count: nMembers,
      min_score: minScore,
      min_members: minMembers,
      fresh_hours: freshH,
      skip_domain_gate: skipDomain,
      allow_any_inferred_domain: anyInferredOk,
    };

    const mergedMetadata = { ...meta, promotion: promotionMeta };

    const { data: updated, error: upErr } = await admin
      .from("thesis_discovery_clusters")
      .update({
        status: "promoted",
        updated_at: new Date().toISOString(),
        metadata: mergedMetadata as never,
      })
      .eq("id", row.id)
      .eq("status", "candidate")
      .select("id")
      .maybeSingle();

    if (upErr) {
      skippedCount += 1;
      console.info("[promote-discovery] promote_failed", { id: row.id, error: upErr.message });
      continue;
    }
    if (!updated || typeof (updated as { id?: unknown }).id !== "string") {
      skippedCount += 1;
      console.info("[promote-discovery] promote_race_or_missing", { id: row.id });
      continue;
    }

    promotedIds.push(row.id);
    console.info("[promote-discovery] promoted", {
      id: row.id,
      signal_score: score,
      domains: promotionMeta.domains,
      member_count: nMembers,
      title_hint: row.title_hint,
    });
  }

  return NextResponse.json({
    ok: true,
    promoted_count: promotedIds.length,
    promoted_ids: promotedIds,
    skipped_count: skippedCount,
    reason: "strict_gates",
    min_score_threshold: minScore,
    min_member_count: minMembers,
    promotion_limit: limit,
    fresh_hours: freshH,
    skip_domain_gate: skipDomain,
    allow_any_inferred_domain: anyInferredOk,
    candidates_loaded: rows.length,
    allowed_domains: Array.from(allowedDomains).sort(),
  });
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runPromoteDiscovery();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runPromoteDiscovery();
}

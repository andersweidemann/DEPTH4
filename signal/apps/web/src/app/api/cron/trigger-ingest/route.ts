import { type NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";

export const runtime = "nodejs";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type BoundedItemRow = {
  source?: string;
  outcome?: string;
  headline?: string | null;
  reason?: string;
  error?: string;
};

type BoundedIngestBody = {
  ok?: boolean;
  skipped_cycle?: boolean;
  skip_reason?: string;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  skipped?: number;
  items?: BoundedItemRow[];
  stopped_reason?: string;
  error?: string;
  detail?: string;
};

function budgetRemainingMs(startedAt: number, budgetMs: number, reserveMs: number) {
  return budgetMs - reserveMs - (Date.now() - startedAt);
}

function isBudgetLow(startedAt: number, budgetMs: number, reserveMs: number) {
  return budgetRemainingMs(startedAt, budgetMs, reserveMs) <= 0;
}

async function fetchBoundedIngest(args: {
  apiBase: string;
  secret: string;
  maxItems: number;
  timeoutMs: number;
}): Promise<{ ok: boolean; status: number; body: BoundedIngestBody; error?: string }> {
  const url = new URL(`${args.apiBase}/cron/ingest-bounded`);
  url.searchParams.set("max_items", String(args.maxItems));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, args.timeoutMs));

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "X-Depth4-Ingest-Secret": args.secret,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    let body: BoundedIngestBody = {};
    if (text) {
      try {
        body = JSON.parse(text) as BoundedIngestBody;
      } catch {
        body = { error: text.slice(0, 500) };
      }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return { ok: false, status: 0, body: {}, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function logItemsFromBatch(items: BoundedItemRow[], seenSources: Set<string>) {
  for (const row of items) {
    const source = (row.source ?? "Wire").trim() || "Wire";
    if (!seenSources.has(source)) {
      seenSources.add(source);
      console.info("[trigger-ingest] source_start", { source });
    }
    const headline = row.headline ?? null;
    if (row.outcome === "success") {
      console.info("[trigger-ingest] item_success", { source, headline });
    } else if (row.outcome === "failed") {
      console.info("[trigger-ingest] item_failed", {
        source,
        headline,
        reason: row.reason,
        error: row.error,
      });
    }
  }
}

async function runTriggerIngest() {
  const startedAt = Date.now();
  const apiBase = (process.env.DEPTH4_API_BASE_URL || "").trim().replace(/\/$/, "");
  const secret = (process.env.DEPTH4_INGEST_CRON_SECRET || "").trim();

  const budgetMs = clamp(Number(process.env.TRIGGER_INGEST_BUDGET_MS ?? "24000"), 5_000, 55_000);
  const reserveMs = clamp(Number(process.env.TRIGGER_INGEST_BUDGET_RESERVE_MS ?? "2500"), 500, 10_000);
  const maxItemsPerRun = clamp(Number(process.env.TRIGGER_INGEST_MAX_ITEMS ?? "5"), 1, 25);
  const maxItemsPerRequest = clamp(
    Number(process.env.TRIGGER_INGEST_MAX_ITEMS_PER_REQUEST ?? "3"),
    1,
    maxItemsPerRun,
  );

  if (!apiBase) {
    return NextResponse.json({ ok: false, error: "Missing DEPTH4_API_BASE_URL" }, { status: 500 });
  }
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing DEPTH4_INGEST_CRON_SECRET" }, { status: 500 });
  }

  console.info("[trigger-ingest] route_start", {
    budget_ms: budgetMs,
    reserve_ms: reserveMs,
    max_items_per_run: maxItemsPerRun,
    max_items_per_request: maxItemsPerRequest,
  });

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let stoppedDueToBudget = false;
  let batches = 0;
  const seenSources = new Set<string>();
  let lastStoppedReason: string | undefined;

  while (attempted < maxItemsPerRun) {
    if (isBudgetLow(startedAt, budgetMs, reserveMs)) {
      stoppedDueToBudget = true;
      console.info("[trigger-ingest] budget_stop", {
        attempted,
        succeeded,
        failed,
        skipped,
        budget_remaining_ms: budgetRemainingMs(startedAt, budgetMs, reserveMs),
      });
      break;
    }

    const remaining = maxItemsPerRun - attempted;
    const batchMax = Math.min(remaining, maxItemsPerRequest);
    const timeoutMs = Math.max(2_000, budgetRemainingMs(startedAt, budgetMs, reserveMs));

    batches += 1;

    const res = await fetchBoundedIngest({
      apiBase,
      secret,
      maxItems: batchMax,
      timeoutMs,
    });

    if (!res.ok) {
      failed += 1;
      console.info("[trigger-ingest] item_failed", {
        source: "api",
        headline: null,
        reason: "upstream_http",
        status: res.status,
        error: res.error ?? res.body.detail ?? res.body.error,
      });
      break;
    }

    const body = res.body;
    if (body.skipped_cycle) {
      skipped += Number(body.skipped ?? 0);
      lastStoppedReason = body.skip_reason ?? body.stopped_reason;
      break;
    }

    const batchAttempted = Number(body.attempted ?? 0);
    const batchSucceeded = Number(body.succeeded ?? 0);
    const batchFailed = Number(body.failed ?? 0);
    const batchSkipped = Number(body.skipped ?? 0);

    attempted += batchAttempted;
    succeeded += batchSucceeded;
    failed += batchFailed;
    skipped += batchSkipped;
    lastStoppedReason = body.stopped_reason;

    logItemsFromBatch(body.items ?? [], seenSources);

    if (batchAttempted === 0) {
      break;
    }

    if (isBudgetLow(startedAt, budgetMs, reserveMs)) {
      stoppedDueToBudget = true;
      console.info("[trigger-ingest] budget_stop", {
        attempted,
        succeeded,
        failed,
        skipped,
        budget_remaining_ms: budgetRemainingMs(startedAt, budgetMs, reserveMs),
      });
      break;
    }
  }

  const duration_ms = Date.now() - startedAt;
  console.info("[trigger-ingest] route_complete", {
    attempted,
    succeeded,
    failed,
    skipped,
    stopped_due_to_budget: stoppedDueToBudget,
    batches,
    duration_ms,
    stopped_reason: lastStoppedReason,
  });

  return NextResponse.json({
    ok: true,
    attempted,
    succeeded,
    failed,
    skipped,
    stopped_due_to_budget: stoppedDueToBudget,
    batches,
    stopped_reason: lastStoppedReason,
    duration_ms,
  });
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runTriggerIngest();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runTriggerIngest();
}

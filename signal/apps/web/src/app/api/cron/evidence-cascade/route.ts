import { type NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { parseHeadlineAndSourceFromEvidence } from "@/lib/thesis/parse-evidence-headline";
import { remodelThesisScenarios } from "@/lib/thesis/remodel-scenarios";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 5;

type EvidenceLogJoin = {
  id: string;
  thesis_id: string;
  description: string | null;
  metadata: unknown;
  probability_before: unknown;
  probability_after: unknown;
};

type QueueRow = {
  id: number;
  thesis_id: string;
  evidence_log_id: string;
  processed: boolean;
  status: string | null;
  trigger_reason: string | null;
  thesis_evidence_log: EvidenceLogJoin | EvidenceLogJoin[] | null;
};

function evidenceLogFromJoin(raw: QueueRow["thesis_evidence_log"]): EvidenceLogJoin | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function isPending(row: QueueRow): boolean {
  if (row.status === "processing") return false;
  if (row.status === "done" || row.status === "failed") return false;
  if (row.status === "pending") return true;
  return !row.processed;
}

/**
 * Process evidence_cascade_queue: full scenario + trade-plan re-model.
 * Schedule: Vercel Cron every 5 minutes → GET /api/cron/evidence-cascade
 */
export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const { data: rows, error: fetchErr } = await admin
    .from("evidence_cascade_queue")
    .select(
      `
      id,
      thesis_id,
      evidence_log_id,
      processed,
      status,
      trigger_reason,
      thesis_evidence_log (
        id,
        thesis_id,
        description,
        metadata,
        probability_before,
        probability_after
      )
    `,
    )
    .in("status", ["pending"])
    .order("created_at", { ascending: true })
    .limit(BATCH);

  let queueRows = (rows ?? []) as unknown as QueueRow[];

  if (fetchErr?.message?.includes("status") || !queueRows.length) {
    const legacy = await admin
      .from("evidence_cascade_queue")
      .select(
        `
        id,
        thesis_id,
        evidence_log_id,
        processed,
        status,
        trigger_reason,
        thesis_evidence_log (
          id,
          thesis_id,
          description,
          metadata,
          probability_before,
          probability_after
        )
      `,
      )
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (!legacy.error) queueRows = (legacy.data ?? []) as unknown as QueueRow[];
  }

  if (fetchErr && !queueRows.length) {
    console.error("[evidence-cascade] queue_fetch_failed", fetchErr.message);
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  const results: Record<string, unknown>[] = [];

  for (const raw of queueRows.filter(isPending)) {
    const mark = async (patch: {
      status: string;
      processed?: boolean;
      result?: unknown;
    }) => {
      await admin
        .from("evidence_cascade_queue")
        .update({
          status: patch.status,
          processed: patch.processed ?? (patch.status === "done" || patch.status === "failed"),
          processed_at: new Date().toISOString(),
          result: patch.result ?? null,
        } as never)
        .eq("id", raw.id);
    };

    const log = evidenceLogFromJoin(raw.thesis_evidence_log);

    try {
      if (log?.probability_before != null && log?.probability_after != null) {
        await mark({ status: "done", result: { skipped: "already_remodeled" } });
        results.push({ thesisId: raw.thesis_id, status: "skipped_already_remodeled" });
        continue;
      }

      await mark({ status: "processing", processed: false });

      const description = String(log?.description ?? "").trim();
      const meta =
        log?.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, unknown>)
          : {};
      parseHeadlineAndSourceFromEvidence(description, meta);

      const remodel = await remodelThesisScenarios(admin, raw.thesis_id, {
        evidenceLogId: raw.evidence_log_id,
        triggerReason: raw.trigger_reason ?? "new_evidence",
      });

      await mark({
        status: "done",
        result: {
          scenarioDelta: remodel.scenarioDelta,
          levelsChanged: remodel.levelsChanged,
          currentPrice: remodel.currentPrice,
        },
      });

      results.push({
        thesisId: raw.thesis_id,
        status: "remodeled",
        scenarioDelta: remodel.scenarioDelta,
        levelsChanged: remodel.levelsChanged,
        feedWorthy: remodel.scenarioDelta >= 10 || remodel.levelsChanged,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      console.error("[evidence-cascade] item_failed", { thesisId: raw.thesis_id, message });
      await mark({ status: "failed", result: { error: message } });
      results.push({ thesisId: raw.thesis_id, status: "failed", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    processedAt: new Date().toISOString(),
    batchSize: results.length,
    results,
  });
}

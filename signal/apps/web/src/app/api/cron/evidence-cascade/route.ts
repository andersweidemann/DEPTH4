import { type NextRequest, NextResponse } from "next/server";
import { maxScenarioDelta } from "@/lib/ai/resolution-probability-update";
import { assertCronSecret } from "@/lib/cron-auth";
import { parseHeadlineAndSourceFromEvidence } from "@/lib/thesis/parse-evidence-headline";
import type { DbScenarioTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { remodelScenariosOnEvidence } from "@/lib/thesis/update-scenarios";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";
export const maxDuration = 300;

const BATCH = 10;

function parseScenarioTriple(raw: unknown): DbScenarioTriple | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = Number(o.base);
  const bull = Number(o.bull);
  const bear = Number(o.bear);
  if (![base, bull, bear].every((n) => Number.isFinite(n))) return null;
  return { base: Math.round(base), bull: Math.round(bull), bear: Math.round(bear) };
}

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
  thesis_evidence_log: EvidenceLogJoin | EvidenceLogJoin[] | null;
};

function evidenceLogFromJoin(raw: QueueRow["thesis_evidence_log"]): EvidenceLogJoin | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/**
 * Process evidence_cascade_queue: remodel scenarios + thesis_updates + evidence probabilities.
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

  if (fetchErr) {
    console.error("[evidence-cascade] queue_fetch_failed", fetchErr.message);
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  const summary: {
    queueId: number;
    thesisId: string;
    evidenceLogId: string;
    status: "skipped_already_remodeled" | "remodeled" | "remodel_failed";
    delta?: number;
    error?: string;
  }[] = [];

  for (const raw of (rows ?? []) as unknown as QueueRow[]) {
    const log = evidenceLogFromJoin(raw.thesis_evidence_log);
    const markProcessed = async () => {
      await admin.from("evidence_cascade_queue").update({ processed: true }).eq("id", raw.id);
    };

    try {
      if (log?.probability_before != null && log?.probability_after != null) {
        summary.push({
          queueId: raw.id,
          thesisId: raw.thesis_id,
          evidenceLogId: raw.evidence_log_id,
          status: "skipped_already_remodeled",
        });
        await markProcessed();
        continue;
      }

      const description = String(log?.description ?? "").trim();
      const meta =
        log?.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, unknown>)
          : {};
      const { headline, source } = parseHeadlineAndSourceFromEvidence(description, meta);

      const remodel = await remodelScenariosOnEvidence(admin, {
        thesisId: raw.thesis_id,
        evidenceLogId: raw.evidence_log_id,
        headline,
        source,
      });

      if (!remodel.ok) {
        summary.push({
          queueId: raw.id,
          thesisId: raw.thesis_id,
          evidenceLogId: raw.evidence_log_id,
          status: "remodel_failed",
          error: remodel.reason,
        });
        await markProcessed();
        continue;
      }

      const { data: thesisRow } = await admin
        .from("theses")
        .select("scenario_probabilities")
        .eq("id", raw.thesis_id)
        .maybeSingle();

      const after = parseScenarioTriple(thesisRow?.scenario_probabilities);
      const before = parseScenarioTriple(log?.probability_before) ?? parseScenarioTriple(meta.scenario_before);
      const delta =
        before && after
          ? maxScenarioDelta(before, after)
          : remodel.scenarios && before
            ? maxScenarioDelta(before, remodel.scenarios)
            : undefined;

      summary.push({
        queueId: raw.id,
        thesisId: raw.thesis_id,
        evidenceLogId: raw.evidence_log_id,
        status: "remodeled",
        delta,
      });
      await markProcessed();
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown_error";
      console.error("[evidence-cascade] item_failed", {
        queueId: raw.id,
        thesisId: raw.thesis_id,
        message,
      });
      summary.push({
        queueId: raw.id,
        thesisId: raw.thesis_id,
        evidenceLogId: raw.evidence_log_id,
        status: "remodel_failed",
        error: message,
      });
      await markProcessed();
    }
  }

  return NextResponse.json({
    ok: true,
    processedAt: new Date().toISOString(),
    batchSize: (rows ?? []).length,
    results: summary,
  });
}

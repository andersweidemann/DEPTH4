import { headers } from "next/headers";
import {
  classifyReaderDevice,
  classifyReaderUserAgent,
  normalizeReaderSourceBucket,
  referrerHost,
} from "@/lib/thesis-engine-v2/thesis-reader-analytics/classify";
import {
  getReaderAnalyticsOpsState,
  recordReaderAnalyticsWriteFailure,
  recordReaderAnalyticsWriteSuccess,
} from "@/lib/thesis-engine-v2/thesis-reader-analytics/ops-state";
import { buildReaderVisitorKey, coarseIpBucket, utcViewDate } from "@/lib/thesis-engine-v2/thesis-reader-analytics/visitor-key";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export function getReaderAnalyticsWriteFailureCount(): number {
  return getReaderAnalyticsOpsState().writeFailures;
}

export { getReaderAnalyticsOpsState } from "@/lib/thesis-engine-v2/thesis-reader-analytics/ops-state";

export type RecordReaderViewInput = {
  thesisId: string;
  slug: string;
  eventSource: "server_render" | "client_beacon";
  clientVisitorToken?: string | null;
};

export type RecordReaderViewRequestContext = {
  userAgent: string;
  referer: string;
  forwardedFor: string;
};

export function parseClientVisitorTokenFromCookie(cookieHeader: string | null | undefined): string | null {
  const raw = cookieHeader ?? "";
  const match = raw.match(/(?:^|;\s*)d4_reader_vid=([^;]*)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().slice(0, 64) || null;
  } catch {
    return null;
  }
}

export async function readRecordReaderViewContext(): Promise<
  RecordReaderViewRequestContext & { clientVisitorToken: string | null }
> {
  const h = await headers();
  return {
    userAgent: h.get("user-agent") ?? "",
    referer: h.get("referer") ?? h.get("referrer") ?? "",
    forwardedFor: h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "",
    clientVisitorToken: parseClientVisitorTokenFromCookie(h.get("cookie")),
  };
}

export function buildReaderViewRow(
  input: RecordReaderViewInput,
  ctx: RecordReaderViewRequestContext & { clientVisitorToken?: string | null },
) {
  const viewDate = utcViewDate();
  const deviceClass = classifyReaderDevice(ctx.userAgent);
  const visitorKind = classifyReaderUserAgent(ctx.userAgent);

  const referrer = ctx.referer.trim() || null;
  const token = input.clientVisitorToken ?? ctx.clientVisitorToken ?? null;
  const visitorKey = buildReaderVisitorKey({
    thesisId: input.thesisId,
    viewDateUtc: viewDate,
    ipBucket: coarseIpBucket(ctx.forwardedFor),
    userAgent: ctx.userAgent,
    deviceClass,
    clientVisitorToken: token,
  });

  return {
    thesis_id: input.thesisId,
    slug: input.slug,
    view_date: viewDate,
    visitor_key: visitorKey,
    visitor_kind: visitorKind,
    source_bucket: normalizeReaderSourceBucket(referrer),
    referrer_host: referrerHost(referrer),
    device_class: deviceClass,
    event_source: input.eventSource,
    metadata: {
      path: `/theses/${input.slug}/read`,
      public: true,
    },
  };
}

/** Fire-and-forget safe — never throws to caller. */
/** Human opens are confirmed via client beacon; server_render logs crawlers/previews only. */
export function shouldRecordReaderView(
  input: RecordReaderViewInput,
  ctx: RecordReaderViewRequestContext,
): boolean {
  const kind = classifyReaderUserAgent(ctx.userAgent);
  if (input.eventSource === "client_beacon") return kind === "human";
  if (input.eventSource === "server_render") return kind !== "human";
  return false;
}

export async function recordPublicReaderView(
  input: RecordReaderViewInput,
  ctx?: RecordReaderViewRequestContext & { clientVisitorToken?: string | null },
): Promise<void> {
  try {
    const context = ctx ?? (await readRecordReaderViewContext());
    if (!shouldRecordReaderView(input, context)) return;

    const row = buildReaderViewRow(input, context);
    const svc = createServiceRoleClient();
    if (!svc) {
      recordReaderAnalyticsWriteFailure("no service role client");
      console.error("[DEPTH4] reader analytics: no service role client");
      return;
    }
    const { error } = await svc.from("thesis_reader_public_views").insert(row as never);
    if (error) {
      recordReaderAnalyticsWriteFailure(error.message);
      console.error("[DEPTH4] reader analytics insert failed", {
        slug: input.slug,
        error: error.message,
      });
      return;
    }
    recordReaderAnalyticsWriteSuccess();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordReaderAnalyticsWriteFailure(msg);
    console.error("[DEPTH4] reader analytics record failed", { slug: input.slug, err });
  }
}

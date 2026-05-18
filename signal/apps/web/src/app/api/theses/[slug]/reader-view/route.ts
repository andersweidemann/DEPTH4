import { NextRequest, NextResponse } from "next/server";
import { isThesisReaderPublic, fetchThesisReaderPublicRow } from "@/lib/thesis-engine-v2/thesis-reader-public";
import {
  classifyReaderUserAgent,
  recordPublicReaderView,
  readRecordReaderViewContext,
} from "@/lib/thesis-engine-v2/thesis-reader-analytics/record";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Client beacon — public thesis reader human confirmation (Phase 4D). */
export async function POST(req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  if (!(await isThesisReaderPublic(slug))) {
    return NextResponse.json({ error: "not_public" }, { status: 404 });
  }

  const row = await fetchThesisReaderPublicRow(slug);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const visitorToken =
    body && typeof body === "object" && typeof (body as { visitorToken?: unknown }).visitorToken === "string"
      ? (body as { visitorToken: string }).visitorToken
      : null;

  const ctx = await readRecordReaderViewContext();
  if (classifyReaderUserAgent(ctx.userAgent) !== "human") {
    return NextResponse.json({ ok: true, recorded: false, reason: "non_human_ua" });
  }

  await recordPublicReaderView(
    {
      thesisId: row.id,
      slug,
      eventSource: "client_beacon",
      clientVisitorToken: visitorToken,
    },
    ctx,
  );

  return NextResponse.json({ ok: true, recorded: true });
}

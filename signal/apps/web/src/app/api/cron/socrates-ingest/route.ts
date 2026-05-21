import { type NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { scrapeSocrates } from "@/lib/sources/socrates-scraper";
import { socratesEvidenceToNewsEventRow, socratesToEvidence } from "@/lib/sources/socrates-to-evidence";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Schedule externally via cron-job.org daily 06:00 ET — not Vercel crons (Hobby plan). */
export async function GET(req: NextRequest) {
  const denied = assertCronSecret(req);
  if (denied) return denied;
  return runSocratesIngest();
}

export async function POST(req: NextRequest) {
  const denied = assertCronSecret(req);
  if (denied) return denied;
  return runSocratesIngest();
}

async function runSocratesIngest() {
  const enabled = (process.env.SOCRATES_ENABLED ?? "").trim().toLowerCase() === "true";
  if (!enabled) {
    return NextResponse.json({ ok: true, ingested: 0, reason: "disabled" });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const socratesData = await scrapeSocrates();
  if (!socratesData) {
    return NextResponse.json({
      ok: true,
      ingested: 0,
      reason: "scrape_failed_or_credentials_missing",
    });
  }

  const evidenceItems = socratesToEvidence(socratesData);
  let inserted = 0;
  let deduped = 0;
  const errors: { headline: string; error: string }[] = [];

  for (const item of evidenceItems) {
    const row = socratesEvidenceToNewsEventRow(item);
    const { error } = await admin.from("news_events").insert(row as never);

    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        deduped += 1;
      } else {
        errors.push({ headline: item.headline, error: error.message });
      }
    } else {
      inserted += 1;
    }
  }

  console.info("[socrates-ingest] complete", {
    inserted,
    deduped,
    total: evidenceItems.length,
    scrapedAt: socratesData.scrapedAt,
  });

  return NextResponse.json({
    ok: true,
    ingested: inserted,
    deduped,
    total: evidenceItems.length,
    scrapedAt: socratesData.scrapedAt,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { insertUserNewsSubmission } from "@/lib/news/news-sources-data";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  url?: string;
  headline?: string;
  body?: string;
};

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as Body | null;
  const url = (payload?.url ?? "").trim();
  const headline = (payload?.headline ?? "").trim();
  const body = (payload?.body ?? "").trim();
  if (!url && !headline && !body) {
    return NextResponse.json({ ok: false, error: "empty_submission" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  try {
    const { id } = await insertUserNewsSubmission(admin, {
      userId: user.id,
      url,
      headline: headline || (url ? `Submitted: ${url}` : "Submitted headline"),
      body: body || url,
    });
    return NextResponse.json({
      ok: true,
      jobId: id,
      message:
        "Queued for DEPTH4 analysis. Check Feed and theses over the next few minutes for mapping or new thesis candidates.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "submit_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

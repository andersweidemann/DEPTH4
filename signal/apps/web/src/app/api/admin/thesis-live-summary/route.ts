import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { buildMutationCoverageReport } from "@/lib/thesis-mutation/thesis-mutation-coverage";

export const runtime = "nodejs";

type SummaryRow = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  evidenceCount: number;
  starredUsers: number;
  inDb: boolean;
};

function adminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET() {
  const emails = adminEmails();
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  if (!email || (emails.length && !emails.includes(email))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !anon || !service) {
    return NextResponse.json({ ok: false, error: "server misconfigured" }, { status: 500 });
  }

  const admin = createAdminClient(url, service, { auth: { persistSession: false } });

  const sinceIso = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [{ data: theses, error: e1 }, { data: evRows, error: e2 }, { data: starRows, error: e3 }, { data: mutRows, error: e4 }] =
    await Promise.all([
      admin.from("theses").select("id,title,slug,status").order("id", { ascending: true }).limit(500),
      admin.from("thesis_evidence_log").select("thesis_id").limit(12_000),
      admin.from("thesis_stars").select("thesis_id,user_id").limit(12_000),
      admin.from("thesis_updates").select("actor_type,change_type,created_at").gte("created_at", sinceIso).limit(5000),
    ]);

  const err = e1 ?? e2 ?? e3 ?? e4;
  if (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }

  const evidenceByThesis = new Map<string, number>();
  for (const r of evRows ?? []) {
    const tid = String((r as { thesis_id?: string }).thesis_id ?? "");
    if (!tid) continue;
    evidenceByThesis.set(tid, (evidenceByThesis.get(tid) ?? 0) + 1);
  }

  const starsByThesis = new Map<string, Set<string>>();
  for (const r of starRows ?? []) {
    const row = r as { thesis_id?: string; user_id?: string };
    const tid = String(row.thesis_id ?? "");
    const uid = String(row.user_id ?? "");
    if (!tid || !uid) continue;
    if (!starsByThesis.has(tid)) starsByThesis.set(tid, new Set());
    starsByThesis.get(tid)!.add(uid);
  }

  const dbList = (theses ?? []) as Array<{ id: string; title: string; slug: string | null; status: string }>;
  const rows: SummaryRow[] = dbList.map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    status: t.status,
    evidenceCount: evidenceByThesis.get(t.id) ?? 0,
    starredUsers: starsByThesis.get(t.id)?.size ?? 0,
    inDb: true,
  }));

  // Orphan evidence / stars (e.g. before seed, or deleted thesis)
  const knownIds = new Set(dbList.map((t) => t.id));
  const orphanIds = new Set<string>();
  for (const tid of Array.from(evidenceByThesis.keys())) {
    if (!knownIds.has(tid)) orphanIds.add(tid);
  }
  for (const tid of Array.from(starsByThesis.keys())) {
    if (!knownIds.has(tid)) orphanIds.add(tid);
  }
  for (const tid of Array.from(orphanIds)) {
    rows.push({
      id: tid,
      title: "(no row in public.theses)",
      slug: null,
      status: "—",
      evidenceCount: evidenceByThesis.get(tid) ?? 0,
      starredUsers: starsByThesis.get(tid)?.size ?? 0,
      inDb: false,
    });
  }

  const mutationAudit24h: Record<string, number> = {};
  for (const r of mutRows ?? []) {
    const actor = String((r as { actor_type?: string }).actor_type ?? "unknown");
    mutationAudit24h[actor] = (mutationAudit24h[actor] ?? 0) + 1;
  }

  rows.sort((a, b) => {
    const d = b.evidenceCount - a.evidenceCount;
    if (d !== 0) return d;
    const s = b.starredUsers - a.starredUsers;
    if (s !== 0) return s;
    return a.id.localeCompare(b.id);
  });

  const mutationCoverage = buildMutationCoverageReport(mutationAudit24h);

  return NextResponse.json({
    ok: true,
    rows,
    totals: {
      evidenceRows: (evRows ?? []).length,
      starRows: (starRows ?? []).length,
      thesisRows: dbList.length,
      mutationAuditRows24h: (mutRows ?? []).length,
    },
    mutationAudit24h,
    mutationCoverage,
  });
}

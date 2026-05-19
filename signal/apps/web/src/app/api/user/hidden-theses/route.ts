import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_hidden_theses")
    .select("thesis_id")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thesisIds: (data ?? []).map((r) => String(r.thesis_id)) });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { thesisId?: string } | null;
  const thesisId = body?.thesisId?.trim();
  if (!thesisId) return NextResponse.json({ error: "thesisId required" }, { status: 400 });

  const { error } = await supabase.from("user_hidden_theses").upsert(
    { user_id: user.id, thesis_id: thesisId },
    { onConflict: "user_id,thesis_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const thesisId = url.searchParams.get("thesisId")?.trim();
  if (!thesisId) return NextResponse.json({ error: "thesisId required" }, { status: 400 });

  const { error } = await supabase
    .from("user_hidden_theses")
    .delete()
    .eq("user_id", user.id)
    .eq("thesis_id", thesisId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

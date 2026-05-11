import { NextResponse } from "next/server";
import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import { createClient } from "@/lib/supabase/server";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: "chat_unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = typeof o.message === "string" ? o.message.trim() : "";
  if (!message) return NextResponse.json({ error: "message_required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loaded = await requireThesisForSlug(supabase, slug, user?.id ?? null);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const model = process.env.ANTHROPIC_MODEL_CHEAP?.trim() || "claude-3-5-haiku-latest";
  const t = loaded.thesis;
  const system = [
    "You are the DEPTH4 thesis assistant. Respond in clear, concise prose.",
    "Educational and analytical only — no personalized investment advice, no instructions to buy or sell.",
    "Thesis context:",
    `Title: ${t.title}`,
    `Asset: ${t.asset}`,
    `Direction: ${t.direction}`,
    `Statement: ${t.thesisStatement}`,
    `Invalidation: ${t.invalidation}`,
    `Trigger: ${t.trigger}`,
    `Trade (narrative): ${t.trade}`,
  ].join("\n");

  try {
    const { text } = await anthropicMessages({
      apiKey,
      model,
      maxTokens: 2048,
      system,
      user: message,
    });
    return NextResponse.json({ reply: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "chat_error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

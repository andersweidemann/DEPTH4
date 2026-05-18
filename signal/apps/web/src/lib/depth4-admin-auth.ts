import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDepth4AdminUserAsync, isDepth4ElevatedUserAsync } from "@/lib/depth4-elevated-access";

export type Depth4AuthUser = { id: string; email?: string | null };

export async function getDepth4AuthUser(): Promise<Depth4AuthUser | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return null;
  return { id: user.id, email: user.email };
}

export async function requireDepth4Elevated(): Promise<
  { user: Depth4AuthUser } | { response: NextResponse }
> {
  const user = await getDepth4AuthUser();
  if (!user) {
    return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  const ok = await isDepth4ElevatedUserAsync({ userId: user.id, email: user.email });
  if (!ok) {
    return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 }) };
  }
  return { user };
}

export async function requireDepth4Admin(): Promise<
  { user: Depth4AuthUser } | { response: NextResponse }
> {
  const user = await getDepth4AuthUser();
  if (!user) {
    return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  const ok = await isDepth4AdminUserAsync({ userId: user.id, email: user.email });
  if (!ok) {
    return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 }) };
  }
  return { user };
}

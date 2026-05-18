import { NextRequest, NextResponse } from "next/server";
import {
  getDepth4RoleOperationalHealth,
  grantDepth4Role,
  listDepth4UserRoles,
  revokeDepth4Role,
  type Depth4Role,
} from "@/lib/depth4-user-roles";
import { requireDepth4Admin } from "@/lib/depth4-admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** List all privileged users (admin only). */
export async function GET() {
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;

  const svc = createServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const roles = await listDepth4UserRoles(svc);
  const health = await getDepth4RoleOperationalHealth(svc);
  return NextResponse.json({ ok: true, roles, health });
}

/** Grant role to user (admin only). */
export async function POST(req: NextRequest) {
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userId = (body as { userId?: string })?.userId?.trim() ?? "";
  const role = (body as { role?: string })?.role?.trim() ?? "";
  if (!userId) return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  if (role !== "admin" && role !== "operator") {
    return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const result = await grantDepth4Role(svc, {
    userId,
    role: role as Depth4Role,
    actorId: auth.user.id,
    reason: "admin_api_grant",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "grant_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId, role });
}

/** Revoke role (admin only). */
export async function DELETE(req: NextRequest) {
  const auth = await requireDepth4Admin();
  if ("response" in auth) return auth.response;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const role = req.nextUrl.searchParams.get("role")?.trim() ?? "";
  if (!userId || (role !== "admin" && role !== "operator")) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  if (userId === auth.user.id && role === "admin") {
    return NextResponse.json({ ok: false, error: "cannot_revoke_own_admin" }, { status: 400 });
  }

  const svc = createServiceRoleClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }

  const result = await revokeDepth4Role(svc, {
    userId,
    role: role as Depth4Role,
    actorId: auth.user.id,
    reason: "admin_api_revoke",
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "revoke_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId, role });
}

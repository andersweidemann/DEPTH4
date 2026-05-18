import { NextResponse } from "next/server";
import { getDepth4AuthUser } from "@/lib/depth4-admin-auth";
import { resolveDepth4Privileges } from "@/lib/depth4-elevated-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Current user's DEPTH4 internal roles (for client UI gates). */
export async function GET() {
  const user = await getDepth4AuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const privileges = await resolveDepth4Privileges({ userId: user.id, email: user.email });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    roles: privileges.roles,
    isAdmin: privileges.isAdmin,
    isOperator: privileges.isOperator,
    isElevated: privileges.isElevated,
    source: privileges.source,
  });
}

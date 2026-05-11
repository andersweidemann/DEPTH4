import { NextResponse } from "next/server";
import { getHelpApiPayload } from "@/lib/help/help-api-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getHelpApiPayload());
}

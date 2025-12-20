import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/app/api/cron/_lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    assertCronAuthorized(req);

    // Placeholder: implement league/event quality scoring here.
    // MVP: keep as a heartbeat endpoint so Vercel Cron is wired.

    return NextResponse.json({ ok: true, message: "quality-check placeholder" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

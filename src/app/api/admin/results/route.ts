import { NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/envServer";
import { settleBetsForEvent, upsertResult } from "@/lib/data/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertAdmin(req: NextRequest) {
  const expected = requireAdminSecret();

  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice("bearer ".length).trim();
    if (token === expected) return;
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (secret && secret === expected) return;

  throw new Error("Unauthorized");
}

export async function POST(req: NextRequest) {
  try {
    assertAdmin(req);

    const body = (await req.json()) as {
      eventId?: string;
      homeScore?: number;
      awayScore?: number;
    };

    const eventId = body.eventId?.trim();
    if (!eventId) {
      return NextResponse.json({ ok: false, error: "Missing eventId" }, { status: 400 });
    }

    const homeScore = Number(body.homeScore);
    const awayScore = Number(body.awayScore);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) {
      return NextResponse.json({ ok: false, error: "Invalid scores" }, { status: 400 });
    }

    const winnerKey = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";

    await upsertResult({ eventId, homeScore, awayScore, winnerKey });
    await settleBetsForEvent(eventId, winnerKey);

    return NextResponse.json({ ok: true, winnerKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

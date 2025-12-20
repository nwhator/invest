import { NextRequest, NextResponse } from "next/server";
import { createBet } from "@/lib/data/bets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      eventId?: string;
      friendName?: string;
      marketKey?: string;
      outcomeKey?: string;
      outcomeName?: string | null;
      line?: number | null;
      oddsPriceUsed?: number;
      stake?: number;
    };

    const eventId = body.eventId?.trim();
    const friendName = body.friendName?.trim();
    const marketKey = body.marketKey?.trim();
    const outcomeKey = body.outcomeKey?.trim();

    if (!eventId || !friendName || !marketKey || !outcomeKey) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const oddsPriceUsed = Number(body.oddsPriceUsed);
    const stake = Number(body.stake ?? 1);
    const line = body.line === null || body.line === undefined ? null : Number(body.line);

    if (!Number.isFinite(oddsPriceUsed) || oddsPriceUsed <= 1) {
      return NextResponse.json({ ok: false, error: "Invalid oddsPriceUsed (expect decimal odds > 1)" }, { status: 400 });
    }

    if (!Number.isFinite(stake) || stake <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid stake" }, { status: 400 });
    }

    const bet = await createBet({
      eventId,
      friendName,
      marketKey,
      outcomeKey,
      outcomeName: body.outcomeName ?? null,
      line,
      oddsPriceUsed,
      stake,
    });

    return NextResponse.json({ ok: true, bet });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

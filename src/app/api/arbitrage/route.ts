import { NextResponse } from "next/server";
import { scanArbitrage } from "@/lib/arbitrage/scan";

function parseNumberParam(value: string | null, fallback: number) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const hoursAhead = parseNumberParam(url.searchParams.get("hoursAhead"), 24);
    const minRoiPercent = parseNumberParam(url.searchParams.get("minRoiPercent"), 0);
    const limit = parseNumberParam(url.searchParams.get("limit"), 200);

    const { opportunities, lastUpdatedUtc } = await scanArbitrage({
      hoursAhead,
      minRoiPercent,
      limit,
    });

    return NextResponse.json({ ok: true, opportunities, lastUpdatedUtc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

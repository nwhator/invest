import { NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/envServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function clampInt(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export async function GET(req: NextRequest) {
  try {
    assertAdmin(req);

    const hoursAhead = clampInt(Number(req.nextUrl.searchParams.get("hoursAhead") ?? 24), 1, 168);
    const now = new Date();
    const end = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("odds_snapshots")
      .select(
        "market_key,snapshot_time_utc,events!inner(commence_time_utc)",
        { count: "exact" }
      )
      .gte("events.commence_time_utc", now.toISOString())
      .lte("events.commence_time_utc", end.toISOString())
      .order("snapshot_time_utc", { ascending: false })
      .limit(10000);

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{ market_key: string; snapshot_time_utc: string }>;

    const byMarket: Record<string, { rows: number; latestSnapshotUtc: string | null }> = {};
    for (const r of rows) {
      const mk = String(r.market_key);
      if (!byMarket[mk]) byMarket[mk] = { rows: 0, latestSnapshotUtc: null };
      byMarket[mk].rows += 1;
      const t = String(r.snapshot_time_utc);
      if (!byMarket[mk].latestSnapshotUtc || t > byMarket[mk].latestSnapshotUtc!) {
        byMarket[mk].latestSnapshotUtc = t;
      }
    }

    const globalLatest = rows.reduce<string | null>((max, r) => {
      const t = String(r.snapshot_time_utc);
      if (!max || t > max) return t;
      return max;
    }, null);

    return NextResponse.json({
      ok: true,
      window: { startUtc: now.toISOString(), endUtc: end.toISOString(), hoursAhead },
      totalRows: rows.length,
      latestSnapshotUtc: globalLatest,
      byMarket,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

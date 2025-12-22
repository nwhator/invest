import { NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/envServer";
import { fetchSports } from "@/lib/providers/theOddsApi";

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

export async function GET(req: NextRequest) {
  try {
    assertAdmin(req);

    const includeAllSports = req.nextUrl.searchParams.get("all") === "true";
    const sports = await fetchSports(includeAllSports);

    const tennisActive = sports
      .filter((s) => s.active)
      .filter((s) => String(s.group).toLowerCase() === "tennis" || String(s.key).toLowerCase().startsWith("tennis_"))
      .filter((s) => !s.has_outrights);

    // Also return "all tennis" keys from /sports?all=true for convenience.
    const sportsAll = await fetchSports(true);
    const tennisAll = sportsAll
      .filter((s) => String(s.group).toLowerCase() === "tennis" || String(s.key).toLowerCase().startsWith("tennis_"))
      .filter((s) => !s.has_outrights);

    return NextResponse.json({
      ok: true,
      count: sports.length,
      tennisActiveCount: tennisActive.length,
      tennisActiveKeys: tennisActive.map((s) => s.key),
      tennisAllCount: tennisAll.length,
      tennisAllKeys: tennisAll.map((s) => s.key),
      sports,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

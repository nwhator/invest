import { NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/envServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchOddsForSport, oddsApiConfig, resolveSportKeys } from "@/lib/providers/theOddsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotInsert = {
  event_id: string;
  provider: string;
  bookmaker: string;
  market_key: string;
  outcome_key: string;
  outcome_name?: string;
  line?: number | null;
  price: number;
  snapshot_time_utc: string;
  raw?: unknown;
};

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

function outcomeKey(marketKey: string, outcomeName: string, opts?: { homeName?: string; awayName?: string }): string {
  const normalized = outcomeName.trim().toLowerCase();

  if ((marketKey === "h2h" || marketKey === "spreads") && opts?.homeName && opts?.awayName) {
    const home = opts.homeName.trim().toLowerCase();
    const away = opts.awayName.trim().toLowerCase();
    if (normalized === home) return "home";
    if (normalized === away) return "away";
    if (normalized === "draw") return "draw";
  }

  if (marketKey === "totals") {
    if (normalized === "over") return "over";
    if (normalized === "under") return "under";
  }

  return normalized;
}

async function ingestOdds() {
  const cfg = oddsApiConfig();
  const sb = supabaseAdmin();

  const snapshotTime = new Date().toISOString();

  let upsertedEvents = 0;
  let insertedSnapshots = 0;

  const debugBySport: Array<{
    sportKey: string;
    eventsFetched: number;
    eventsWithBookmakers: number;
    snapshotsPrepared: number;
    attempt: "primary" | "fallback";
    regions: string;
    markets: string;
  }> = [];

  // Arbitrage scanner is 2-outcome only, so ingest h2h markets.
  const markets = "h2h";

  const { keys: resolvedSportKeys, skipped } = await resolveSportKeys(cfg.sportKeys.length ? cfg.sportKeys : ["upcoming"]);
  const sportKeys = resolvedSportKeys.length ? resolvedSportKeys : ["upcoming"];

  for (const sportKey of sportKeys) {
    const runAttempt = async (attempt: "primary" | "fallback", regions: string) => {
      let events;
      try {
        events = await fetchOddsForSport(sportKey, { regions, markets });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNKNOWN_SPORT")) {
          throw new Error(
            `${msg}\nHint: call /api/admin/odds-sports?secret=YOUR_ADMIN_SECRET to see valid keys, then set ODDS_SPORT_KEYS accordingly (or use ODDS_SPORT_KEYS=upcoming).`
          );
        }
        throw e;
      }

      let eventsWithBookmakers = 0;
      let snapshotsPrepared = 0;

      for (const ev of events) {
        const { data: upserted, error: upsertErr } = await sb
          .from("events")
          .upsert(
            {
              sport_key: ev.sport_key,
              league_key: ev.sport_key,
              commence_time_utc: ev.commence_time,
              home_name: ev.home_team,
              away_name: ev.away_team,
              odds_provider: "the-odds-api",
              odds_provider_event_id: ev.id,
              status: "scheduled",
            },
            {
              onConflict: "odds_provider,odds_provider_event_id",
            }
          )
          .select("id")
          .single();

        if (upsertErr || !upserted) {
          throw new Error(`Failed to upsert event: ${upsertErr?.message ?? "unknown"}`);
        }

        upsertedEvents += 1;

        const snapshots: SnapshotInsert[] = [];
        for (const bookmaker of ev.bookmakers ?? []) {
          for (const market of bookmaker.markets ?? []) {
            if (market.key !== "h2h") continue;
            for (const out of market.outcomes ?? []) {
              snapshots.push({
                event_id: upserted.id,
                provider: "the-odds-api",
                bookmaker: bookmaker.key,
                market_key: market.key,
                outcome_key: outcomeKey(market.key, out.name, { homeName: ev.home_team, awayName: ev.away_team }),
                outcome_name: out.name,
                line: out.point ?? null,
                price: out.price,
                snapshot_time_utc: snapshotTime,
                raw: { sportKey, eventId: ev.id },
              });
            }
          }
        }

        if ((ev.bookmakers ?? []).length > 0) eventsWithBookmakers += 1;
        snapshotsPrepared += snapshots.length;

        if (snapshots.length) {
          const { error: insertErr } = await sb.from("odds_snapshots").insert(snapshots);
          if (insertErr) {
            throw new Error(`Failed to insert snapshots: ${insertErr.message}`);
          }
          insertedSnapshots += snapshots.length;
        }
      }

      debugBySport.push({
        sportKey,
        attempt,
        regions,
        markets,
        eventsFetched: events.length,
        eventsWithBookmakers,
        snapshotsPrepared,
      });

      return { eventsFetched: events.length, eventsWithBookmakers, snapshotsPrepared };
    };

    const primary = await runAttempt("primary", cfg.regions);

    // If we got events but no snapshot rows (often caused by region mismatch), retry with broad regions.
    if (primary.eventsFetched > 0 && primary.snapshotsPrepared === 0) {
      await runAttempt("fallback", "us,eu,uk,au");
    }
  }

  return {
    upsertedEvents,
    insertedSnapshots,
    usedSportKeys: sportKeys,
    skippedSportKeys: skipped,
    debugBySport,
    cfg: { regions: cfg.regions, markets, oddsFormat: cfg.oddsFormat, dateFormat: cfg.dateFormat },
  };
}

export async function GET(req: NextRequest) {
  try {
    assertAdmin(req);
    const result = await ingestOdds();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertAdmin(req);
    const result = await ingestOdds();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

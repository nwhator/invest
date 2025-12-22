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

  // Tennis-only: resolve keys using the official /v4/sports list and skip invalid ones.
  // Recommended env: ODDS_SPORT_KEYS=tennis
  const { keys: resolvedSportKeys, skipped } = await resolveSportKeys(cfg.sportKeys.length ? cfg.sportKeys : ["tennis"]);
  const tennisOnly = resolvedSportKeys.filter((k) => k.toLowerCase().startsWith("tennis_"));

  if (tennisOnly.length === 0) {
    // Some Odds API accounts/plans do not include tennis keys in /v4/sports.
    // As a last resort, try the special 'upcoming' sport (always valid) and filter tennis from it.
    const primaryUpcoming = await fetchOddsForSport("upcoming", { regions: cfg.regions, markets: "h2h" }).catch(() => []);
    const primaryTennisUpcoming = (primaryUpcoming ?? []).filter((e) => String(e.sport_key).toLowerCase().startsWith("tennis_"));

    // If tennis exists but has no bookmakers in the configured region, retry with broader regions.
    const primaryHasBookmakers = primaryTennisUpcoming.some((e) => (e.bookmakers ?? []).length > 0);
    const fallbackRegions = "us,eu,uk,au";

    const fallbackUpcoming =
      !primaryHasBookmakers && cfg.regions !== fallbackRegions
        ? await fetchOddsForSport("upcoming", { regions: fallbackRegions, markets: "h2h" }).catch(() => [])
        : [];
    const fallbackTennisUpcoming = (fallbackUpcoming ?? []).filter((e) => String(e.sport_key).toLowerCase().startsWith("tennis_"));

    const tennisUpcoming =
      fallbackTennisUpcoming.some((e) => (e.bookmakers ?? []).length > 0) ? fallbackTennisUpcoming : primaryTennisUpcoming;
    const usedRegions = tennisUpcoming === fallbackTennisUpcoming ? fallbackRegions : cfg.regions;

    if (tennisUpcoming.length === 0) {
      throw new Error(
        `Your Odds API /sports list contains no tennis keys, and the 'upcoming' feed returned no tennis events.\n` +
          `This usually means your Odds API plan/account does not currently provide tennis coverage.\n` +
          `Resolved non-tennis keys: ${resolvedSportKeys.join(",") || "(none)"}\n` +
          `Skipped invalid keys: ${skipped.join(",") || "(none)"}\n` +
          `Try /api/admin/odds-sports?secret=YOUR_ADMIN_SECRET and look for tennisAllKeys; if it's empty, tennis isn't available on this key.`
      );
    }

    // If tennis appears via 'upcoming', ingest those events only.
    for (const ev of tennisUpcoming) {
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
              raw: { sportKey: "upcoming", eventId: ev.id },
            });
          }
        }
      }

      if (snapshots.length) {
        const { error: insertErr } = await sb.from("odds_snapshots").insert(snapshots);
        if (insertErr) throw new Error(`Failed to insert snapshots: ${insertErr.message}`);
        insertedSnapshots += snapshots.length;
      }
    }

    debugBySport.push({
      sportKey: "upcoming",
      attempt: usedRegions === cfg.regions ? "primary" : "fallback",
      regions: usedRegions,
      markets: "h2h",
      eventsFetched: tennisUpcoming.length,
      eventsWithBookmakers: tennisUpcoming.filter((e) => (e.bookmakers ?? []).length > 0).length,
      snapshotsPrepared: tennisUpcoming.reduce((acc, e) => {
        const count = (e.bookmakers ?? []).reduce((a, b) => a + (b.markets ?? []).reduce((c, m) => c + (m.outcomes ?? []).length, 0), 0);
        return acc + count;
      }, 0),
    });

    return {
      upsertedEvents,
      insertedSnapshots,
      usedSportKeys: ["upcoming"],
      skippedSportKeys: skipped,
      debugBySport,
      cfg: { regions: cfg.regions, markets: "h2h", oddsFormat: cfg.oddsFormat, dateFormat: cfg.dateFormat },
    };
  }

  for (const sportKey of tennisOnly) {
    const runAttempt = async (attempt: "primary" | "fallback", regions: string, markets: string) => {
      let events;
      try {
        events = await fetchOddsForSport(sportKey, { regions, markets });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNKNOWN_SPORT")) {
          throw new Error(
            `${msg}\nHint: call /api/admin/odds-sports?secret=YOUR_ADMIN_SECRET to see valid keys, then set ODDS_SPORT_KEYS accordingly (or just set ODDS_SPORT_KEYS=tennis).`
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

    // Primary attempt: your configured regions/markets.
    const primary = await runAttempt("primary", cfg.regions, cfg.markets);

    // If the API returns events but no odds (common for tennis in US books / non-supported markets), retry.
    if (primary.eventsFetched > 0 && primary.snapshotsPrepared === 0) {
      // Fallback attempt: broader non-US regions + h2h-only.
      await runAttempt("fallback", "eu,uk,au", "h2h");
    }
  }

  return {
    upsertedEvents,
    insertedSnapshots,
    usedSportKeys: tennisOnly,
    skippedSportKeys: skipped,
    debugBySport,
    cfg: { regions: cfg.regions, markets: cfg.markets, oddsFormat: cfg.oddsFormat, dateFormat: cfg.dateFormat },
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

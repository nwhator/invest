import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/app/api/cron/_lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchOddsForSport, oddsApiConfig } from "@/lib/providers/theOddsApi";

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

function outcomeKey(marketKey: string, outcomeName: string): string {
  const normalized = outcomeName.trim().toLowerCase();

  if (marketKey === "totals") {
    if (normalized === "over") return "over";
    if (normalized === "under") return "under";
  }

  // For h2h/spreads: outcome names are usually team names.
  // We'll map to home/away/draw when possible later; for now store a stable key.
  // (We store the human-readable name too.)
  return normalized;
}

export async function GET(req: NextRequest) {
  try {
    assertCronAuthorized(req);

    const cfg = oddsApiConfig();
    const sb = supabaseAdmin();

    const snapshotTime = new Date().toISOString();

    let upsertedEvents = 0;
    let insertedSnapshots = 0;

    for (const sportKey of cfg.sportKeys) {
      const events = await fetchOddsForSport(sportKey);

      for (const ev of events) {
        // Upsert canonical event.
        const { data: upserted, error: upsertErr } = await sb
          .from("events")
          .upsert(
            {
              sport_key: ev.sport_key,
              league_key: ev.sport_key, // placeholder until you add league mapping
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
                outcome_key: outcomeKey(market.key, out.name),
                outcome_name: out.name,
                line: out.point ?? null,
                price: out.price,
                snapshot_time_utc: snapshotTime,
                raw: { sportKey, eventId: ev.id },
              });
            }
          }
        }

        if (snapshots.length) {
          const { error: insertErr } = await sb.from("odds_snapshots").insert(snapshots);
          if (insertErr) {
            throw new Error(`Failed to insert snapshots: ${insertErr.message}`);
          }
          insertedSnapshots += snapshots.length;
        }
      }
    }

    return NextResponse.json({ ok: true, upsertedEvents, insertedSnapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isArbitrage, roiPercent, stakePlan } from "@/lib/arbitrage/math";

import type { ArbBestOdd, ArbOpportunity } from "./types";
export type { ArbBestOdd, ArbOpportunity } from "./types";

type SnapshotJoinRow = {
  event_id: string;
  bookmaker: string;
  market_key: string;
  outcome_key: string;
  outcome_name: string | null;
  line: number | null;
  price: number;
  snapshot_time_utc: string;
  events: {
    sport_key: string;
    league_key: string | null;
    commence_time_utc: string;
    home_name: string;
    away_name: string;
  };
};

function clampInt(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export async function scanArbitrage(opts?: {
  hoursAhead?: number;
  minRoiPercent?: number;
  limit?: number;
}): Promise<{ opportunities: ArbOpportunity[]; lastUpdatedUtc: string }> {
  const hoursAhead = clampInt(opts?.hoursAhead ?? 24, 1, 168);
  const minRoiPercent =
    typeof opts?.minRoiPercent === "number" && Number.isFinite(opts.minRoiPercent)
      ? opts.minRoiPercent
      : 0.3;
  const limit = clampInt(opts?.limit ?? 200, 1, 500);

  const sb = supabaseAdmin();
  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  // Pull recent snapshots for upcoming events.
  // We will keep only the latest snapshot per event.
  const { data, error } = await sb
    .from("odds_snapshots")
    .select(
      "event_id,bookmaker,market_key,outcome_key,outcome_name,line,price,snapshot_time_utc,events!inner(sport_key,league_key,commence_time_utc,home_name,away_name)"
    )
    .in("market_key", ["h2h", "spreads"])
    .gte("events.commence_time_utc", now.toISOString())
    .lte("events.commence_time_utc", end.toISOString())
    .order("snapshot_time_utc", { ascending: false })
    .limit(8000);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as SnapshotJoinRow[];
  if (!rows.length) return { opportunities: [], lastUpdatedUtc: new Date().toISOString() };

  // Latest snapshot per event.
  const latestByEvent = new Map<string, string>();
  for (const r of rows) {
    const existing = latestByEvent.get(r.event_id);
    if (!existing || r.snapshot_time_utc > existing) latestByEvent.set(r.event_id, r.snapshot_time_utc);
  }

  const latestRows = rows.filter((r) => r.snapshot_time_utc === latestByEvent.get(r.event_id));

  // Track the newest snapshot time across all candidate events.
  const globalLastUpdated = latestRows.reduce((max, r) => {
    const t = String(r.snapshot_time_utc);
    return t > max ? t : max;
  }, String(latestRows[0]!.snapshot_time_utc));

  // Group by event.
  const byEvent = new Map<string, SnapshotJoinRow[]>();
  for (const r of latestRows) {
    const arr = byEvent.get(r.event_id);
    if (arr) arr.push(r);
    else byEvent.set(r.event_id, [r]);
  }

  const opportunities: ArbOpportunity[] = [];

  for (const [eventId, evRows] of byEvent.entries()) {
    if (!evRows.length) continue;

    const sample = evRows[0]!;
    const sport = String(sample.events.sport_key);
    const league = sample.events.league_key ?? null;
    const startTimeUtc = String(sample.events.commence_time_utc);
    const homeName = String(sample.events.home_name);
    const awayName = String(sample.events.away_name);

    const lastUpdatedUtc = String(sample.snapshot_time_utc);

    // --- h2h (2-outcome only: no draw) ---
    {
      const h2hRows = evRows.filter((r) => String(r.market_key) === "h2h");
      if (h2hRows.length) {
        const outcomeKeys = new Set<string>();
        for (const r of h2hRows) {
          const odds = Number(r.price);
          if (!Number.isFinite(odds) || odds <= 1) continue;
          outcomeKeys.add(String(r.outcome_key));
        }

        // Strict 2-way only.
        if (!outcomeKeys.has("draw") && outcomeKeys.size === 2 && outcomeKeys.has("home") && outcomeKeys.has("away")) {
          let bestA: ArbBestOdd | null = null;
          let bestB: ArbBestOdd | null = null;

          for (const r of h2hRows) {
            const odds = Number(r.price);
            if (!Number.isFinite(odds) || odds <= 1) continue;

            const ok = String(r.outcome_key);
            if (ok !== "home" && ok !== "away") continue;

            if (ok === "home") {
              if (!bestA || odds > bestA.odds) bestA = { odds, bookmaker: String(r.bookmaker) };
            } else {
              if (!bestB || odds > bestB.odds) bestB = { odds, bookmaker: String(r.bookmaker) };
            }
          }

          if (bestA && bestB) {
            const oddsA = bestA.odds;
            const oddsB = bestB.odds;
            if (isArbitrage({ oddsA, oddsB }, minRoiPercent)) {
              opportunities.push({
                eventId,
                sport,
                league,
                startTimeUtc,
                marketKey: "h2h",
                bestOdds: { A: bestA, B: bestB },
                outcomeLabels: { A: homeName, B: awayName },
                roiPercent: roiPercent({ oddsA, oddsB }),
                impliedSum: 1 / oddsA + 1 / oddsB,
                lastUpdatedUtc,
              });
            }
          }
        }
      }
    }

    // --- spreads / handicap (2-outcome only, match by absolute line) ---
    {
      const spreadRows = evRows.filter((r) => String(r.market_key) === "spreads");
      if (spreadRows.length) {
        type BestForLine = {
          bestA: ArbBestOdd | null;
          bestB: ArbBestOdd | null;
          lineA: number | null;
          lineB: number | null;
        };

        const byAbsLine = new Map<string, BestForLine>();

        for (const r of spreadRows) {
          const odds = Number(r.price);
          if (!Number.isFinite(odds) || odds <= 1) continue;

          const ok = String(r.outcome_key);
          if (ok !== "home" && ok !== "away") continue;

          const lineVal = r.line == null ? NaN : Number(r.line);
          if (!Number.isFinite(lineVal)) continue;

          const absLine = Math.abs(lineVal);
          const key = String(absLine);

          const cur = byAbsLine.get(key) ?? { bestA: null, bestB: null, lineA: null, lineB: null };
          if (ok === "home") {
            if (!cur.bestA || odds > cur.bestA.odds) {
              cur.bestA = { odds, bookmaker: String(r.bookmaker) };
              cur.lineA = lineVal;
            }
          } else {
            if (!cur.bestB || odds > cur.bestB.odds) {
              cur.bestB = { odds, bookmaker: String(r.bookmaker) };
              cur.lineB = lineVal;
            }
          }
          byAbsLine.set(key, cur);
        }

        for (const cur of byAbsLine.values()) {
          if (!cur.bestA || !cur.bestB) continue;
          const oddsA = cur.bestA.odds;
          const oddsB = cur.bestB.odds;
          if (!isArbitrage({ oddsA, oddsB }, minRoiPercent)) continue;

          opportunities.push({
            eventId,
            sport,
            league,
            startTimeUtc,
            marketKey: "spreads",
            outcomeLines: { A: cur.lineA ?? null, B: cur.lineB ?? null },
            bestOdds: { A: cur.bestA, B: cur.bestB },
            outcomeLabels: { A: homeName, B: awayName },
            roiPercent: roiPercent({ oddsA, oddsB }),
            impliedSum: 1 / oddsA + 1 / oddsB,
            lastUpdatedUtc,
          });
        }
      }
    }
  }

  opportunities.sort((a, b) => b.roiPercent - a.roiPercent);

  return {
    opportunities: opportunities.slice(0, limit),
    lastUpdatedUtc: globalLastUpdated,
  };
}

export function computeStakeSummary(opportunity: ArbOpportunity, bankroll: number) {
  const { oddsA, oddsB } = { oddsA: opportunity.bestOdds.A.odds, oddsB: opportunity.bestOdds.B.odds };
  return stakePlan(bankroll, { oddsA, oddsB });
}

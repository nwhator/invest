import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isArbitrage, roiPercent, stakePlan } from "@/lib/arbitrage/math";

export type ArbBestOdd = { odds: number; bookmaker: string };

export type ArbOpportunity = {
  eventId: string;
  sport: string;
  league: string | null;
  startTimeUtc: string;

  bestOdds: {
    A: ArbBestOdd;
    B: ArbBestOdd;
  };

  // For 2-outcome markets, A=home and B=away.
  outcomeLabels: {
    A: string;
    B: string;
  };

  roiPercent: number;
  impliedSum: number;

  lastUpdatedUtc: string;
};

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
    .eq("market_key", "h2h")
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

    // Strictly enforce two-outcome markets:
    // If the latest snapshot contains a draw (common in soccer) or any extra outcome,
    // skip it entirely. This scanner is 2-way arb only.
    const outcomeKeys = new Set<string>();
    for (const r of evRows) {
      const odds = Number(r.price);
      if (!Number.isFinite(odds) || odds <= 1) continue;
      outcomeKeys.add(String(r.outcome_key));
    }
    if (outcomeKeys.has("draw")) continue;
    if (!(outcomeKeys.size === 2 && outcomeKeys.has("home") && outcomeKeys.has("away"))) continue;

    let bestA: ArbBestOdd | null = null;
    let bestB: ArbBestOdd | null = null;

    for (const r of evRows) {
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

    if (!bestA || !bestB) continue;

    const oddsA = bestA.odds;
    const oddsB = bestB.odds;

    if (!isArbitrage({ oddsA, oddsB }, minRoiPercent)) continue;

    const implied = 1 / oddsA + 1 / oddsB;
    const roi = roiPercent({ oddsA, oddsB });

    opportunities.push({
      eventId,
      sport,
      league,
      startTimeUtc,
      bestOdds: { A: bestA, B: bestB },
      outcomeLabels: { A: homeName, B: awayName },
      roiPercent: roi,
      impliedSum: implied,
      lastUpdatedUtc,
    });
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

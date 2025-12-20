import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type Suggestion = {
  eventId: string;
  sportKey: string;
  commenceTimeUtc: string;
  homeName: string;
  awayName: string;

  marketKey: string;
  line: number | null;

  outcomeKey: string;
  outcomeName: string | null;

  bestBookmaker: string;
  bestPrice: number;

  fairProb: number;
  ev: number;
};

type OddsRow = {
  event_id: string;
  sport_key: string;
  commence_time_utc: string;
  home_name: string;
  away_name: string;

  snapshot_time_utc: string;

  bookmaker: string;
  market_key: string;
  outcome_key: string;
  outcome_name: string | null;
  line: number | null;
  price: number;
};

type OddsSnapshotJoinRow = {
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
    commence_time_utc: string;
    home_name: string;
    away_name: string;
  };
};

function keyForGroup(row: OddsRow): string {
  const line = row.line === null ? "" : String(row.line);
  return [row.event_id, row.market_key, line].join("|");
}

function keyForOutcome(row: OddsRow): string {
  const line = row.line === null ? "" : String(row.line);
  return [row.market_key, line, row.outcome_key].join("|");
}

export async function getDailySuggestions(options?: {
  hoursAhead?: number;
  minEv?: number;
  limit?: number;
}): Promise<Suggestion[]> {
  const hoursAhead = options?.hoursAhead ?? 24;
  const minEv = options?.minEv ?? 0.01;
  const limit = options?.limit ?? 30;

  const sb = supabaseAdmin();

  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  // Pull a bounded amount of recent odds snapshots for events in the next window.
  // For MVP, we just look at the latest snapshot per event by grabbing the newest rows.
  const { data, error } = await sb
    .from("odds_snapshots")
    .select(
      "event_id,bookmaker,market_key,outcome_key,outcome_name,line,price,snapshot_time_utc,events!inner(sport_key,commence_time_utc,home_name,away_name)"
    )
    .gte("events.commence_time_utc", now.toISOString())
    .lte("events.commence_time_utc", end.toISOString())
    .order("snapshot_time_utc", { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);

  const raw = (data ?? []) as unknown as OddsSnapshotJoinRow[];
  const rows: OddsRow[] = raw.map((r) => ({
    event_id: String(r.event_id),
    bookmaker: String(r.bookmaker),
    market_key: String(r.market_key),
    outcome_key: String(r.outcome_key),
    outcome_name: r.outcome_name,
    line: r.line === null ? null : Number(r.line),
    price: Number(r.price),
    snapshot_time_utc: String(r.snapshot_time_utc),
    sport_key: String(r.events.sport_key),
    commence_time_utc: String(r.events.commence_time_utc),
    home_name: String(r.events.home_name),
    away_name: String(r.events.away_name),
  }));

  if (rows.length === 0) return [];

  // Determine latest snapshot time per event, then keep only that snapshot.
  const latestByEvent = new Map<string, string>();
  for (const row of rows) {
    const existing = latestByEvent.get(row.event_id);
    if (!existing || row.snapshot_time_utc > existing) {
      latestByEvent.set(row.event_id, row.snapshot_time_utc);
    }
  }

  const latestRows: OddsRow[] = rows.filter((row) => row.snapshot_time_utc === latestByEvent.get(row.event_id));

  // Group rows by (event, market, line) and compute fair probabilities by averaging implied probs.
  const groups = new Map<string, OddsRow[]>();
  for (const row of latestRows) {
    const k = keyForGroup(row);
    const arr = groups.get(k);
    if (arr) arr.push(row);
    else groups.set(k, [row]);
  }

  const suggestions: Suggestion[] = [];

  for (const groupRows of groups.values()) {
    // Fair prob = average implied prob across books, then normalized to remove vig.
    const impliedByOutcome = new Map<string, number[]>();
    const bestByOutcome = new Map<string, OddsRow>();

    for (const row of groupRows) {
      if (!Number.isFinite(row.price) || row.price <= 1) continue;
      const implied = 1 / row.price;
      const ok = keyForOutcome(row);

      const arr = impliedByOutcome.get(ok);
      if (arr) arr.push(implied);
      else impliedByOutcome.set(ok, [implied]);

      const existingBest = bestByOutcome.get(ok);
      if (!existingBest || row.price > existingBest.price) {
        bestByOutcome.set(ok, row);
      }
    }

    const avgImplied: Array<{ ok: string; avg: number }> = [];
    for (const [ok, vals] of impliedByOutcome.entries()) {
      if (!vals.length) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      avgImplied.push({ ok, avg });
    }

    const sum = avgImplied.reduce((a, b) => a + b.avg, 0);
    if (sum <= 0) continue;

    for (const { ok, avg } of avgImplied) {
      const fairProb = avg / sum;
      const best = bestByOutcome.get(ok);
      if (!best) continue;

      const ev = fairProb * best.price - 1;
      if (ev < minEv) continue;

      suggestions.push({
        eventId: best.event_id,
        sportKey: best.sport_key,
        commenceTimeUtc: best.commence_time_utc,
        homeName: best.home_name,
        awayName: best.away_name,
        marketKey: best.market_key,
        line: best.line,
        outcomeKey: best.outcome_key,
        outcomeName: best.outcome_name,
        bestBookmaker: best.bookmaker,
        bestPrice: best.price,
        fairProb,
        ev,
      });
    }
  }

  suggestions.sort((a, b) => b.ev - a.ev);
  return suggestions.slice(0, limit);
}

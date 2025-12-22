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

  // Baseline quality signals (odds-only)
  bookCount: number;
  disagreement: number;
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

type PredictionRow = {
  event_id: string;
  market_key: string;
  outcome_key: string;
  line: number | null;
  model_version: string;
  predicted_prob: number;
  generated_time_utc: string;
};

type ResultJoinRow = {
  winner_key: string | null;
  final_time_utc: string | null;
  events: {
    sport_key: string;
    home_name: string;
    away_name: string;
  };
};

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varSum = values.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  return Math.sqrt(varSum / (values.length - 1));
}

function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase();
}

function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

async function buildTennisEloIndex(sb: ReturnType<typeof supabaseAdmin>, opts?: { maxMatches?: number; k?: number }) {
  const maxMatches = opts?.maxMatches ?? 5000;
  const k = opts?.k ?? 24;

  const { data, error } = await sb
    .from("results")
    .select("winner_key,final_time_utc,events!inner(sport_key,home_name,away_name)")
    .like("events.sport_key", "tennis_%")
    .order("final_time_utc", { ascending: true })
    .limit(maxMatches);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as ResultJoinRow[];

  const ratings = new Map<string, number>();
  const games = new Map<string, number>();

  const getRating = (player: string) => ratings.get(player) ?? 1500;
  const incGames = (player: string) => games.set(player, (games.get(player) ?? 0) + 1);

  for (const r of rows) {
    const winnerKey = (r.winner_key ?? "").toLowerCase();
    if (winnerKey !== "home" && winnerKey !== "away") continue;

    const home = normalizePlayerName(r.events.home_name);
    const away = normalizePlayerName(r.events.away_name);
    if (!home || !away || home === away) continue;

    const eloHome = getRating(home);
    const eloAway = getRating(away);
    const expectedHome = eloWinProb(eloHome, eloAway);
    const scoreHome = winnerKey === "home" ? 1 : 0;
    const delta = k * (scoreHome - expectedHome);

    ratings.set(home, eloHome + delta);
    ratings.set(away, eloAway - delta);
    incGames(home);
    incGames(away);
  }

  return {
    getElo: (playerName: string) => ratings.get(normalizePlayerName(playerName)) ?? 1500,
    getGames: (playerName: string) => games.get(normalizePlayerName(playerName)) ?? 0,
  };
}

function keyForGroup(row: OddsRow): string {
  const line = row.line === null ? "" : String(row.line);
  return [row.event_id, row.market_key, line].join("|");
}

function keyForOutcome(row: OddsRow): string {
  const line = row.line === null ? "" : String(row.line);
  return [row.market_key, line, row.outcome_key].join("|");
}

function predKey(eventId: string, marketKey: string, line: number | null, outcomeKey: string): string {
  const lineKey = line === null ? "" : String(line);
  return [eventId, marketKey, lineKey, outcomeKey].join("|");
}

export async function getDailySuggestions(options?: {
  hoursAhead?: number;
  minEv?: number;
  limit?: number;
  // Put tennis events first.
  prioritizeTennis?: boolean;

  // Odds-only robustness.
  minBooks?: number;

  // Tennis-only (non-ML) learning: Elo from stored results.
  useTennisElo?: boolean;
}): Promise<Suggestion[]> {
  const hoursAhead = options?.hoursAhead ?? 24;
  const minEv = options?.minEv ?? 0.01;
  const limit = options?.limit ?? 30;
  const prioritizeTennis = options?.prioritizeTennis ?? true;
  const minBooks = options?.minBooks ?? 3;
  const useTennisElo = options?.useTennisElo ?? true;

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
    .like("events.sport_key", "tennis_%")
    .gte("events.commence_time_utc", now.toISOString())
    .lte("events.commence_time_utc", end.toISOString())
    .order("snapshot_time_utc", { ascending: false })
    .limit(2000);

  if (error) throw new Error(error.message);

  const raw = (data ?? []) as unknown as OddsSnapshotJoinRow[];
  const rows: OddsRow[] = raw.map((r) => {
    const outcomeName = r.outcome_name;
    const home = String(r.events.home_name).trim().toLowerCase();
    const away = String(r.events.away_name).trim().toLowerCase();
    const normalizedOutcomeName = outcomeName ? outcomeName.trim().toLowerCase() : "";

    // If provider outcome key isn't home/away, map it using names.
    // This is especially important for tennis (outcome names are player names).
    let outcomeKey = String(r.outcome_key);
    if (normalizedOutcomeName && outcomeKey !== "home" && outcomeKey !== "away" && outcomeKey !== "draw") {
      if (normalizedOutcomeName === home) outcomeKey = "home";
      else if (normalizedOutcomeName === away) outcomeKey = "away";
    }

    return {
    event_id: String(r.event_id),
    bookmaker: String(r.bookmaker),
    market_key: String(r.market_key),
      outcome_key: outcomeKey,
      outcome_name: outcomeName,
    line: r.line === null ? null : Number(r.line),
    price: Number(r.price),
    snapshot_time_utc: String(r.snapshot_time_utc),
    sport_key: String(r.events.sport_key),
    commence_time_utc: String(r.events.commence_time_utc),
    home_name: String(r.events.home_name),
    away_name: String(r.events.away_name),
    };
  });

  if (rows.length === 0) return [];

  // Optional: Build a lightweight tennis Elo index from stored results.
  // This lets suggestions improve over time without any ML job.
  const eloIndex = useTennisElo ? await buildTennisEloIndex(sb).catch(() => null) : null;

  // Determine latest snapshot time per event, then keep only that snapshot.
  const latestByEvent = new Map<string, string>();
  for (const row of rows) {
    const existing = latestByEvent.get(row.event_id);
    if (!existing || row.snapshot_time_utc > existing) {
      latestByEvent.set(row.event_id, row.snapshot_time_utc);
    }
  }

  const latestRows: OddsRow[] = rows.filter((row) => row.snapshot_time_utc === latestByEvent.get(row.event_id));

  // Pull latest ML predictions for these events (optional).
  const eventIds = Array.from(new Set(latestRows.map((r) => r.event_id)));
  const predictionsByKey = new Map<string, PredictionRow>();
  if (eventIds.length) {
    const { data: predData, error: predError } = await sb
      .from("predictions")
      .select("event_id,market_key,outcome_key,line,model_version,predicted_prob,generated_time_utc")
      .in("event_id", eventIds)
      .order("generated_time_utc", { ascending: false })
      .limit(5000);

    if (predError) throw new Error(predError.message);

    const preds = (predData ?? []) as unknown as PredictionRow[];
    for (const p of preds) {
      const k = predKey(String(p.event_id), String(p.market_key), p.line === null ? null : Number(p.line), String(p.outcome_key));
      if (!predictionsByKey.has(k)) {
        predictionsByKey.set(k, {
          event_id: String(p.event_id),
          market_key: String(p.market_key),
          outcome_key: String(p.outcome_key),
          line: p.line === null ? null : Number(p.line),
          model_version: String(p.model_version),
          predicted_prob: Number(p.predicted_prob),
          generated_time_utc: String(p.generated_time_utc),
        });
      }
    }
  }

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
    // Fair prob baseline = median implied prob across books, then normalized to remove vig.
    // Confidence = disagreement (stddev) of implied probs across books.
    const impliedByOutcome = new Map<string, number[]>();
    const bestByOutcome = new Map<string, OddsRow>();

    for (const row of groupRows) {
      if (!Number.isFinite(row.price) || row.price <= 1) continue;
      const implied = 1 / row.price;
      const ok = keyForOutcome(row);

      const arr = impliedByOutcome.get(ok);
      if (arr) arr.push(implied);
      else impliedByOutcome.set(ok, [implied]);

      // "Best" for this UX = lowest decimal odds available (safer / smaller odds).
      const existingBest = bestByOutcome.get(ok);
      if (!existingBest || row.price < existingBest.price) {
        bestByOutcome.set(ok, row);
      }
    }

    const medianImplied: Array<{ ok: string; med: number; count: number; disagreement: number }> = [];
    for (const [ok, vals] of impliedByOutcome.entries()) {
      const count = vals.length;
      if (count < minBooks) continue;
      const med = median(vals);
      if (!Number.isFinite(med) || med <= 0) continue;
      medianImplied.push({ ok, med, count, disagreement: stddev(vals) });
    }

    const sum = medianImplied.reduce((a, b) => a + b.med, 0);
    if (sum <= 0) continue;

    // Elo blend for tennis h2h: produce a single home win probability for this group.
    // Applied only when we have ratings for both players and only for home/away outcomes.
    let eloHomeProb: number | null = null;
    let eloWeight = 0;
    if (eloIndex && groupRows.length) {
      const sample = groupRows[0];
      const isTennis = sample.sport_key.startsWith("tennis_");
      const isH2h = sample.market_key === "h2h";
      if (isTennis && isH2h) {
        const homeElo = eloIndex.getElo(sample.home_name);
        const awayElo = eloIndex.getElo(sample.away_name);
        const homeGames = eloIndex.getGames(sample.home_name);
        const awayGames = eloIndex.getGames(sample.away_name);

        const minGames = Math.min(homeGames, awayGames);
        // Ramp Elo influence up with more history, capped to avoid overpowering market.
        eloWeight = Math.max(0, Math.min(0.6, minGames / 20));
        if (eloWeight > 0) {
          eloHomeProb = eloWinProb(homeElo, awayElo);
        }
      }
    }

    for (const { ok, med, count, disagreement } of medianImplied) {
      const noVigFairProb = med / sum;
      const best = bestByOutcome.get(ok);
      if (!best) continue;

      // Odds-only enhancement: blend in Elo for tennis h2h, when available.
      let baselineFairProb = noVigFairProb;
      if (eloHomeProb !== null && (best.outcome_key === "home" || best.outcome_key === "away")) {
        const eloProb = best.outcome_key === "home" ? eloHomeProb : 1 - eloHomeProb;
        baselineFairProb = (1 - eloWeight) * noVigFairProb + eloWeight * eloProb;
      }

      // If an ML prediction exists for this outcome, use it as fair probability.
      const p = predictionsByKey.get(predKey(best.event_id, best.market_key, best.line, best.outcome_key));
      const fairProb = p ? p.predicted_prob : baselineFairProb;

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

        bookCount: count,
        disagreement,
      });
    }
  }

  suggestions.sort((a, b) => {
    const aIsTennis = a.sportKey.startsWith("tennis_");
    const bIsTennis = b.sportKey.startsWith("tennis_");
    if (prioritizeTennis && aIsTennis !== bIsTennis) return aIsTennis ? -1 : 1;

    // Prefer smaller odds (safer / rollover style).
    if (a.bestPrice !== b.bestPrice) return a.bestPrice - b.bestPrice;

    // Then prefer higher confidence (lower disagreement across books).
    if (a.disagreement !== b.disagreement) return a.disagreement - b.disagreement;

    // Then higher fair probability.
    if (a.fairProb !== b.fairProb) return b.fairProb - a.fairProb;

    // Finally, higher EV.
    return b.ev - a.ev;
  });
  return suggestions.slice(0, limit);
}

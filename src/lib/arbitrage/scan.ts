import { isArbitrage, roiPercent, stakePlan } from "@/lib/arbitrage/math";
import { fetchArbitrageAdvantages } from "@/lib/providers/sportsbookApi2";

import type { ArbOpportunity } from "./types";
export type { ArbOpportunity } from "./types";

function clampInt(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function toDecimalOdds(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;

  // Heuristic: if it looks like American odds, convert to decimal.
  // American odds are typically <= -100 or >= +100.
  if (Math.abs(n) >= 100 && Math.abs(n) < 10000 && (Number.isInteger(n) || Math.abs(n) >= 100)) {
    if (n > 0) return 1 + n / 100;
    return 1 + 100 / Math.abs(n);
  }

  // Otherwise treat as decimal.
  return n > 1 ? n : null;
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normText(x: unknown): string {
  return String(x ?? "").trim();
}

function isDrawLabel(x: string): boolean {
  const t = x.trim().toLowerCase();
  return t === "draw" || t === "x" || t === "tie";
}

type RapidLeg = {
  bookmaker?: string;
  odds?: unknown;
  selection?: string;
  line?: unknown;
};

type JsonObject = Record<string, unknown>;

function getProp(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  return (obj as JsonObject)[key];
}

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    cur = getProp(cur, key);
    if (cur === undefined) return undefined;
  }
  return cur;
}

function pickFirst<T>(...candidates: Array<T | null | undefined>): T | null {
  for (const c of candidates) {
    if (c == null) continue;
    return c;
  }
  return null;
}

function extractArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const arr = pickFirst(
    getProp(json, "advantages"),
    getProp(json, "results"),
    getProp(json, "data"),
    getProp(json, "items")
  );
  return Array.isArray(arr) ? (arr as unknown[]) : [];
}

function extractLegs(item: unknown): RapidLeg[] {
  const rawLegs = pickFirst(
    getProp(item, "legs"),
    getProp(item, "bets"),
    getProp(item, "outcomes"),
    getProp(item, "advantages"),
    getPath(item, ["arbitrage", "legs"]),
    getPath(item, ["arbitrage", "bets"])
  );

  if (!Array.isArray(rawLegs)) return [];

  return rawLegs
    .map((l) => {
      const bookmaker = normText(
        pickFirst(
          getProp(l, "sportsbook"),
          getProp(l, "bookmaker"),
          getProp(l, "book"),
          getProp(l, "operator"),
          getProp(l, "site"),
          getProp(l, "sportsbookName")
        )
      );
      const odds = pickFirst(
        getProp(l, "odds"),
        getProp(l, "price"),
        getProp(l, "decimalOdds"),
        getProp(l, "americanOdds"),
        getProp(l, "lineOdds")
      );
      const selection = normText(
        pickFirst(
          getProp(l, "selection"),
          getProp(l, "pick"),
          getProp(l, "outcome"),
          getProp(l, "team"),
          getProp(l, "name"),
          getProp(l, "side")
        )
      );
      const line = pickFirst(getProp(l, "line"), getProp(l, "handicap"), getProp(l, "point"), getProp(l, "total"));
      return { bookmaker: bookmaker || undefined, odds, selection, line };
    })
    .filter((l) => l.bookmaker || l.selection || l.odds != null);
}

function parseStartTimeUtc(item: unknown): string | null {
  const raw = pickFirst(
    getProp(item, "startTimeUtc"),
    getProp(item, "start_time_utc"),
    getProp(item, "start_time"),
    getProp(item, "commence_time"),
    getProp(item, "commenceTime"),
    getPath(item, ["event", "startTime"]),
    getPath(item, ["event", "start_time"]),
    getPath(item, ["event", "commence_time"])
  );
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function inferMarketKey(legs: RapidLeg[]): "h2h" | "spreads" | "totals" {
  const selections = legs.map((l) => (l.selection ?? "").toLowerCase());
  if (selections.some((s) => s.includes("over")) && selections.some((s) => s.includes("under"))) return "totals";
  const hasLine = legs.some((l) => {
    const n = toNumber(l.line);
    return n != null;
  });
  return hasLine ? "spreads" : "h2h";
}

function isOppositeSpreadLines(a: number, b: number): boolean {
  // Typical two-way handicap arbitrage requires opposite sides on the same line: -x / +x
  const eps = 1e-9;
  if (Math.abs(a) < eps && Math.abs(b) < eps) return true;
  if (a * b >= 0) return false;
  return Math.abs(Math.abs(a) - Math.abs(b)) < eps;
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
      : 0;
  const limit = clampInt(opts?.limit ?? 200, 1, 500);

  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  const fetchedAtUtc = new Date().toISOString();

  const json = await fetchArbitrageAdvantages();
  const items = extractArray(json);

  const opportunities: ArbOpportunity[] = [];

  for (const item of items) {
    const legs = extractLegs(item);
    if (legs.length !== 2) continue;

    const selectionA = normText(legs[0]?.selection);
    const selectionB = normText(legs[1]?.selection);
    if (!selectionA || !selectionB) continue;
    if (isDrawLabel(selectionA) || isDrawLabel(selectionB)) continue;

    const oddsA = toDecimalOdds(legs[0]?.odds);
    const oddsB = toDecimalOdds(legs[1]?.odds);
    if (!oddsA || !oddsB) continue;

    const mk = inferMarketKey(legs);

    const rawLineA = toNumber(legs[0]?.line);
    const rawLineB = toNumber(legs[1]?.line);

    if (mk === "spreads") {
      if (rawLineA == null || rawLineB == null) continue;
      if (!isOppositeSpreadLines(rawLineA, rawLineB)) continue;
    }

    if (mk === "totals") {
      if (rawLineA == null || rawLineB == null) continue;
      if (Math.abs(rawLineA - rawLineB) > 1e-9) continue;
    }

    // Enforce our strict two-way mapping.
    if (mk === "totals") {
      const aLower = selectionA.toLowerCase();
      const bLower = selectionB.toLowerCase();
      if (!(aLower.includes("over") && bLower.includes("under")) && !(aLower.includes("under") && bLower.includes("over"))) {
        continue;
      }
    }

    const startTimeUtc = parseStartTimeUtc(item) ?? fetchedAtUtc;
    if (startTimeUtc) {
      const d = new Date(startTimeUtc);
      if (Number.isFinite(d.getTime()) && (d < now || d > end)) {
        // Respect hoursAhead window when we have a start time.
        continue;
      }
    }

    if (!isArbitrage({ oddsA, oddsB }, minRoiPercent)) continue;

    const sport =
      normText(
        pickFirst(
          getProp(item, "sport"),
          getProp(item, "sport_key"),
          getProp(item, "sportKey"),
          getPath(item, ["league", "sport"]),
          getPath(item, ["event", "sport"])
        )
      ) || "unknown";
    const league = normText(pickFirst(getProp(item, "league"), getProp(item, "league_key"), getProp(item, "leagueKey"), getPath(item, ["event", "league"]))) || null;

    const homeName = normText(
      pickFirst(getProp(item, "home"), getProp(item, "home_team"), getProp(item, "homeTeam"), getPath(item, ["event", "home"]), getPath(item, ["event", "home_team"]))
    );
    const awayName = normText(
      pickFirst(getProp(item, "away"), getProp(item, "away_team"), getProp(item, "awayTeam"), getPath(item, ["event", "away"]), getPath(item, ["event", "away_team"]))
    );
    const eventName = normText(
      pickFirst(getProp(item, "event"), getProp(item, "event_name"), getProp(item, "eventName"), getProp(item, "match"), getProp(item, "name"), getProp(item, "title"))
    );

    const eventId =
      normText(pickFirst(getProp(item, "id"), getProp(item, "event_id"), getProp(item, "eventId"), getProp(item, "uuid"))) ||
      `${sport}:${eventName}:${selectionA}:${selectionB}`;

    const cleanLineA = rawLineA ?? null;
    const cleanLineB = rawLineB ?? null;

    const bookmakerA = normText(legs[0]?.bookmaker) || "unknown";
    const bookmakerB = normText(legs[1]?.bookmaker) || "unknown";

    // For display, always show a matchup title. If we don't have teams, fall back to selections.
    const labelA = homeName || selectionA;
    const labelB = awayName || selectionB;

    // Ensure totals show Over/Under consistently.
    const betLabelA = mk === "totals" ? (selectionA.toLowerCase().includes("under") ? "Under" : "Over") : selectionA;
    const betLabelB = mk === "totals" ? (selectionB.toLowerCase().includes("under") ? "Under" : "Over") : selectionB;

    opportunities.push({
      eventId,
      sport,
      league,
      startTimeUtc,
      marketKey: mk,
      betLabels: { A: betLabelA, B: betLabelB },
      outcomeLines:
        mk === "h2h"
          ? undefined
          : {
              A: cleanLineA,
              B: cleanLineB,
            },
      bestOdds: {
        A: { odds: oddsA, bookmaker: bookmakerA },
        B: { odds: oddsB, bookmaker: bookmakerB },
      },
      outcomeLabels: { A: labelA, B: labelB },
      roiPercent: roiPercent({ oddsA, oddsB }),
      impliedSum: 1 / oddsA + 1 / oddsB,
      lastUpdatedUtc: fetchedAtUtc,
    });
  }

  opportunities.sort((a, b) => b.roiPercent - a.roiPercent);

  return { opportunities: opportunities.slice(0, limit), lastUpdatedUtc: fetchedAtUtc };
}

export function computeStakeSummary(opportunity: ArbOpportunity, bankroll: number) {
  const { oddsA, oddsB } = { oddsA: opportunity.bestOdds.A.odds, oddsB: opportunity.bestOdds.B.odds };
  return stakePlan(bankroll, { oddsA, oddsB });
}

import { NextResponse } from "next/server";
import { sportsbookApi2Config, fetchArbitrageAdvantages } from "@/lib/providers/sportsbookApi2";

type JsonObject = Record<string, unknown>;

function getProp(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  return (obj as JsonObject)[key];
}

function pickArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const candidates = [getProp(json, "advantages"), getProp(json, "results"), getProp(json, "data"), getProp(json, "items")];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as unknown[];
  }
  return [];
}

function normText(x: unknown): string {
  return String(x ?? "").trim();
}

function isDrawLabel(x: string): boolean {
  const t = x.trim().toLowerCase();
  return t === "draw" || t === "x" || t === "tie";
}

function toDecimalOdds(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;

  // Heuristic American -> decimal
  if (Math.abs(n) >= 100 && Math.abs(n) < 10000 && (Number.isInteger(n) || Math.abs(n) >= 100)) {
    if (n > 0) return 1 + n / 100;
    return 1 + 100 / Math.abs(n);
  }

  return n > 1 ? n : null;
}

function extractLegs(item: unknown): Array<{ selection: string; bookmaker: string; odds: unknown }> {
  const direct = getProp(item, "legs") ?? getProp(item, "bets");
  const outcomes = getProp(item, "outcomes");

  const unwrap = (x: unknown): unknown => {
    // Some APIs wrap outcomes like { outcomes: [...] } or { items: [...] }
    if (x && typeof x === "object") {
      const o = x as JsonObject;
      if (Array.isArray(o.outcomes)) return o.outcomes;
      if (Array.isArray(o.items)) return o.items;
      if (Array.isArray(o.data)) return o.data;
      if (Array.isArray(o.results)) return o.results;
    }
    return x;
  };

  const toArr = (x: unknown): unknown[] => {
    const u = unwrap(x);
    if (Array.isArray(u)) return u;
    if (u && typeof u === "object") return Object.values(u as Record<string, unknown>);
    return [];
  };

  const raw = Array.isArray(direct) ? direct : toArr(outcomes);

  return raw
    .map((l) => {
      const bookmaker = normText(
        getProp(l, "sportsbook") ?? getProp(l, "bookmaker") ?? getProp(l, "book") ?? getProp(l, "operator") ?? getProp(l, "site")
      );
      const odds = getProp(l, "odds") ?? getProp(l, "price") ?? getProp(l, "decimalOdds") ?? getProp(l, "americanOdds") ?? getProp(l, "lineOdds");
      const selection = normText(
        getProp(l, "selection") ?? getProp(l, "pick") ?? getProp(l, "outcome") ?? getProp(l, "team") ?? getProp(l, "name") ?? getProp(l, "side")
      );
      return { bookmaker, odds, selection };
    })
    .filter((l) => l.bookmaker || l.selection || l.odds != null);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const fetchedAtUtc = new Date().toISOString();

  try {
    const cfg = sportsbookApi2Config();

    const raw = await fetchArbitrageAdvantages();
    const items = pickArray(raw);

    let twoLegCount = 0;
    let twoLegNonDrawCount = 0;
    let twoLegOddsParsableCount = 0;

    const outcomesCountHistogram: Record<string, number> = {};

    const sample = items[0] ?? null;
    const sampleOutcomesRaw = sample ? getProp(sample, "outcomes") : undefined;
    const sampleOutcomesUnwrapped = (() => {
      if (!sampleOutcomesRaw) return undefined;
      if (sampleOutcomesRaw && typeof sampleOutcomesRaw === "object") {
        const o = sampleOutcomesRaw as JsonObject;
        if (Array.isArray(o.outcomes)) return o.outcomes;
        if (Array.isArray(o.items)) return o.items;
        if (Array.isArray(o.data)) return o.data;
        if (Array.isArray(o.results)) return o.results;
      }
      return sampleOutcomesRaw;
    })();

    for (const item of items) {
      const legs = extractLegs(item);

      // Track outcome counts (based on extraction) so we can see if feed is mostly 3-way.
      outcomesCountHistogram[String(legs.length)] = (outcomesCountHistogram[String(legs.length)] ?? 0) + 1;

      if (legs.length !== 2) continue;
      twoLegCount += 1;

      const aSel = legs[0]?.selection ?? "";
      const bSel = legs[1]?.selection ?? "";
      if (!aSel || !bSel) continue;
      if (isDrawLabel(aSel) || isDrawLabel(bSel)) continue;
      twoLegNonDrawCount += 1;

      const aOdds = toDecimalOdds(legs[0]?.odds);
      const bOdds = toDecimalOdds(legs[1]?.odds);
      if (!aOdds || !bOdds) continue;
      twoLegOddsParsableCount += 1;
    }

    return NextResponse.json({
      ok: true,
      fetchedAtUtc,
      rapidApiHost: cfg.rapidApiHost,
      advantagesCount: items.length,
      twoLegCount,
      twoLegNonDrawCount,
      twoLegOddsParsableCount,
      outcomesCountHistogram,
      sampleOutcomesType: sampleOutcomesRaw == null ? null : Array.isArray(sampleOutcomesRaw) ? "array" : typeof sampleOutcomesRaw,
      sampleOutcomesUnwrappedType:
        sampleOutcomesUnwrapped == null ? null : Array.isArray(sampleOutcomesUnwrapped) ? "array" : typeof sampleOutcomesUnwrapped,
      sampleExtractedOutcomeCount: sample ? extractLegs(sample).length : 0,
      sampleExtractedSelections: sample
        ? extractLegs(sample)
            .slice(0, 4)
            .map((l) => l.selection)
        : [],
      sampleExtractedOddsDecimal: sample
        ? extractLegs(sample)
            .slice(0, 4)
            .map((l) => toDecimalOdds(l.odds))
        : [],
      topLevelKeys: raw && typeof raw === "object" ? Object.keys(raw as JsonObject).slice(0, 30) : [],
      sampleItemKeys: items[0] && typeof items[0] === "object" ? Object.keys(items[0] as JsonObject).slice(0, 30) : [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Don't leak secrets. The error message should be safe (we never include the key).
    return NextResponse.json(
      {
        ok: false,
        fetchedAtUtc,
        error: message,
        hint:
          "Check RAPIDAPI_KEY in .env.local and confirm your RapidAPI subscription for sportsbook-api2. Also watch for 401/403 (auth), 429 (rate limit), or 5xx (provider).",
      },
      { status: 500 }
    );
  }
}

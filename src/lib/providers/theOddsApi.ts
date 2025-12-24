import { csvEnv, optionalEnv, requiredEnv } from "@/lib/env";

export type OddsApiSportKey = string;

export type OddsApiSport = {
  key: string;
  group: string;
  title: string;
  description?: string;
  active: boolean;
  has_outrights: boolean;
};

type OddsApiOutcome = {
  name: string;
  price: number;
  point?: number;
};

type OddsApiMarket = {
  key: string; // h2h | spreads | totals
  outcomes: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsApiMarket[];
};

type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

export function oddsApiConfig() {
  return {
    apiKey: requiredEnv("ODDS_API_KEY"),
    // Default to the cross-sport feed so the scanner covers all available sports on your plan.
    sportKeys: csvEnv("ODDS_SPORT_KEYS", "upcoming"),
    // Broaden default regions for better bookmaker coverage; override with ODDS_REGIONS if needed.
    regions: optionalEnv("ODDS_REGIONS", "us,eu,uk,au")!,
    // Arbitrage scanner supports 2-outcome markets only (h2h + spreads).
    markets: optionalEnv("ODDS_MARKETS", "h2h,spreads")!,
    oddsFormat: optionalEnv("ODDS_ODDS_FORMAT", "decimal")!,
    dateFormat: optionalEnv("ODDS_DATE_FORMAT", "iso")!,
  };
}

export async function fetchOddsForSport(
  sportKey: OddsApiSportKey,
  overrides?: {
    regions?: string;
    markets?: string;
    oddsFormat?: string;
    dateFormat?: string;
  }
): Promise<OddsApiEvent[]> {
  const cfg = oddsApiConfig();

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`);
  url.searchParams.set("regions", overrides?.regions ?? cfg.regions);
  url.searchParams.set("markets", overrides?.markets ?? cfg.markets);
  url.searchParams.set("oddsFormat", overrides?.oddsFormat ?? cfg.oddsFormat);
  url.searchParams.set("dateFormat", overrides?.dateFormat ?? cfg.dateFormat);
  url.searchParams.set("apiKey", cfg.apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`The Odds API error (${res.status}): ${body}`);
  }

  const json = (await res.json()) as OddsApiEvent[];
  return json;
}

export async function fetchSports(all = false): Promise<OddsApiSport[]> {
  const cfg = oddsApiConfig();

  const url = new URL("https://api.the-odds-api.com/v4/sports/");
  url.searchParams.set("apiKey", cfg.apiKey);
  if (all) url.searchParams.set("all", "true");

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`The Odds API error (${res.status}): ${body}`);
  }

  return (await res.json()) as OddsApiSport[];
}

export async function expandSportKeys(inputKeys: string[]): Promise<string[]> {
  const normalized = inputKeys.map((k) => k.trim()).filter(Boolean);

  // Convenience alias: ODDS_SPORT_KEYS=all means “scan across everything available”.
  // The Odds API provides this via the special 'upcoming' key.
  const wantsAll = normalized.some((k) => k.toLowerCase() === "all");
  if (wantsAll) {
    const withoutAll = normalized.filter((k) => k.trim().toLowerCase() !== "all");
    return Array.from(new Set(["upcoming", ...withoutAll]));
  }

  const wantsTennisAlias = normalized.some((k) => k.toLowerCase() === "tennis" || k.toLowerCase() === "tennis_all");
  if (!wantsTennisAlias) return normalized;

  // Use all=true so "tennis" expands to every tennis key your plan supports,
  // not just the currently in-season (active) subset.
  const sports = await fetchSports(true);
  const tennisKeys = sports
    .filter((s) => String(s.group).toLowerCase() === "tennis" || String(s.key).toLowerCase().startsWith("tennis_"))
    .filter((s) => !s.has_outrights)
    .map((s) => s.key);

  const withoutAlias = normalized.filter((k) => {
    const t = k.toLowerCase();
    return t !== "tennis" && t !== "tennis_all";
  });

  // Keep any explicitly provided keys AND all active tennis keys.
  return Array.from(new Set([...withoutAlias, ...tennisKeys]));
}

export async function resolveSportKeys(inputKeys: string[]): Promise<{ keys: string[]; skipped: string[] }> {
  const expanded = await expandSportKeys(inputKeys);
  const sports = await fetchSports(true);
  const valid = new Set(sports.map((s) => s.key));

  const keys: string[] = [];
  const skipped: string[] = [];

  for (const k of expanded) {
    const key = k.trim();
    if (!key) continue;
    // Aliases should already be stripped by expandSportKeys, but keep this defensive.
    const lower = key.toLowerCase();
    if (lower === "tennis" || lower === "tennis_all") continue;
    // The Odds API supports a special 'upcoming' key for cross-sport upcoming events.
    // It is not guaranteed to appear in /v4/sports, so treat it as always valid.
    if (lower === "upcoming") {
      keys.push("upcoming");
      continue;
    }
    if (valid.has(key)) keys.push(key);
    else skipped.push(key);
  }

  return { keys: Array.from(new Set(keys)), skipped: Array.from(new Set(skipped)) };
}

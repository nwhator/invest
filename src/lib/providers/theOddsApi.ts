import { csvEnv, optionalEnv, requiredEnv } from "@/lib/env";

export type OddsApiSportKey = string;

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
    sportKeys: csvEnv("ODDS_SPORT_KEYS", "soccer_epl,americanfootball_nfl"),
    regions: optionalEnv("ODDS_REGIONS", "us")!,
    markets: optionalEnv("ODDS_MARKETS", "h2h,spreads,totals")!,
    oddsFormat: optionalEnv("ODDS_ODDS_FORMAT", "decimal")!,
    dateFormat: optionalEnv("ODDS_DATE_FORMAT", "iso")!,
  };
}

export async function fetchOddsForSport(sportKey: OddsApiSportKey): Promise<OddsApiEvent[]> {
  const cfg = oddsApiConfig();

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`);
  url.searchParams.set("regions", cfg.regions);
  url.searchParams.set("markets", cfg.markets);
  url.searchParams.set("oddsFormat", cfg.oddsFormat);
  url.searchParams.set("dateFormat", cfg.dateFormat);
  url.searchParams.set("apiKey", cfg.apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`The Odds API error (${res.status}): ${body}`);
  }

  const json = (await res.json()) as OddsApiEvent[];
  return json;
}

export type ArbMarketKey = "h2h" | "spreads";

export type ArbBestOdd = { odds: number; bookmaker: string };

export type ArbOpportunity = {
  eventId: string;
  sport: string;
  league: string | null;
  startTimeUtc: string;

  marketKey: ArbMarketKey;
  // For spreads/handicap, each side has its own point.
  outcomeLines?: {
    A: number | null;
    B: number | null;
  };

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

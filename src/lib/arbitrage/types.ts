export type ArbMarketKey = "h2h" | "spreads" | "totals";

export type ArbBestOdd = { odds: number; bookmaker: string };

export type ArbOpportunity = {
  eventId: string;
  sport: string;
  league: string | null;
  startTimeUtc: string;

  marketKey: ArbMarketKey;
  // Bet-side labels for the arbitrage legs.
  // - h2h/spreads: home/away
  // - totals: Over/Under
  betLabels: {
    A: string;
    B: string;
  };

  // Optional bet lines.
  // - spreads: +/- handicap per team
  // - totals: total line for Over/Under (A and B will be the same)
  outcomeLines?: { A: number | null; B: number | null };

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

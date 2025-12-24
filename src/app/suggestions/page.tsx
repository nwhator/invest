import type { Metadata } from "next";
import { scanArbitrage } from "@/lib/arbitrage/scan";
import ArbitrageClient from "@/app/suggestions/ArbitrageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arbitrage",
  description: "Guaranteed arbitrage opportunities from the latest odds snapshots (best odds per outcome across books).",
};

type Props = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function SuggestionsPage({ searchParams }: Props) {
  const hoursAhead = 24;
  const minRoiPercent = 0.3;
  const { opportunities, lastUpdatedUtc } = await scanArbitrage({
    hoursAhead,
    minRoiPercent,
    limit: 500,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Arbitrage (two-outcome, next {hoursAhead}h)</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Finds guaranteed arbitrage when the best available odds for each outcome (across all bookmakers) satisfy
        {" "}
        <span className="font-mono">(1/oddsA + 1/oddsB) &lt; 1</span>. Only two-outcome markets are included (no-draw {"h2h"} and
        {" "}
        {"spreads"} / handicap).
      </p>

      <ArbitrageClient
        initial={opportunities}
        initialLastUpdatedUtc={lastUpdatedUtc}
        minRoiPercent={minRoiPercent}
        hoursAhead={hoursAhead}
      />

      <div className="mt-6 rounded-xl border border-indigo-200/80 bg-indigo-50/70 p-4 shadow-sm">
        <div className="text-sm font-medium text-indigo-900">Important</div>
        <p className="mt-1 text-sm text-zinc-600">
          This site does not place bets. Arbitrage is only guaranteed if you can place both sides at the shown odds before
          they move.
        </p>
      </div>
    </main>
  );
}

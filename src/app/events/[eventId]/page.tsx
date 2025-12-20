import Link from "next/link";
import { getEventById } from "@/lib/data/events";
import { getLatestOddsForEvent } from "@/lib/data/odds";
import { listBetsForEvent } from "@/lib/data/bets";
import BetForm from "@/app/events/[eventId]/BetForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ eventId: string }>;
};

function formatUtc(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

export default async function EventPage({ params }: Props) {
  const { eventId } = await params;

  const event = await getEventById(eventId);
  if (!event) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="text-xl font-semibold">Event not found</h1>
        <Link className="mt-4 inline-block underline" href="/">
          Back
        </Link>
      </main>
    );
  }

  const latestOdds = await getLatestOddsForEvent(eventId);
  const recentBets = await listBetsForEvent(eventId, 25);

  const oddsRows = latestOdds?.rows ?? [];

  // Keep only the lowest decimal price per (market, outcome, line).
  // This makes the table + pick dropdown easier to use.
  const lowestByOutcome = new Map<string, (typeof oddsRows)[number]>();
  for (const row of oddsRows) {
    const k = [row.market_key, row.outcome_key, row.line ?? ""].join("|");
    const existing = lowestByOutcome.get(k);
    if (!existing || row.price < existing.price) {
      lowestByOutcome.set(k, row);
    }
  }

  const lowestOddsRows = Array.from(lowestByOutcome.values()).map((r) => ({
    ...r,
    // Ensure unique keys even though we've de-duped.
    id: [r.market_key, r.outcome_key, r.line ?? "", r.bookmaker].join("|"),
  }));
  const groupedByMarket: Record<string, typeof oddsRows> = {};
  for (const row of lowestOddsRows) {
    (groupedByMarket[row.market_key] ??= []).push(row);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="text-sm text-zinc-600">
        <Link className="underline" href="/">
          Events
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-semibold">
        {event.home_name} vs {event.away_name}
      </h1>
      <div className="mt-1 text-sm text-zinc-600">
        {event.sport_key} • {formatUtc(event.commence_time_utc)}
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <div className="text-sm font-medium">Latest odds snapshot (lowest price per outcome)</div>
        <div className="mt-1 text-xs text-zinc-500">
          {latestOdds ? `Snapshot: ${formatUtc(latestOdds.snapshotTimeUtc)}` : "No odds yet."}
        </div>

        {!latestOdds ? null : (
          <div className="mt-4 space-y-6">
            {Object.entries(groupedByMarket).map(([marketKey, rows]) => (
              <div key={marketKey}>
                <div className="text-sm font-semibold">{marketKey}</div>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-zinc-600">
                        <th className="border-b p-2">Bookmaker</th>
                        <th className="border-b p-2">Outcome</th>
                        <th className="border-b p-2">Line</th>
                        <th className="border-b p-2">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .slice()
                        .sort((a, b) => a.price - b.price)
                        .map((r) => (
                          <tr key={r.id}>
                            <td className="border-b p-2 font-mono text-xs">{r.bookmaker}</td>
                            <td className="border-b p-2">{r.outcome_name ?? r.outcome_key}</td>
                            <td className="border-b p-2">{r.line ?? "—"}</td>
                            <td className="border-b p-2">{r.price}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <div className="text-sm font-medium">Place a friend pick</div>
        <p className="mt-1 text-sm text-zinc-600">
          Saves a pick into the <span className="font-mono">bets</span> table (no auth yet).
        </p>

        <div className="mt-4">
          <BetForm eventId={eventId} oddsRows={lowestOddsRows} />
        </div>
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <div className="text-sm font-medium">Recent picks</div>
        {recentBets.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No picks yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-zinc-600">
                  <th className="border-b p-2">Friend</th>
                  <th className="border-b p-2">Selection</th>
                  <th className="border-b p-2">Stake</th>
                  <th className="border-b p-2">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {recentBets.map((b) => (
                  <tr key={b.id}>
                    <td className="border-b p-2">{b.friend_name}</td>
                    <td className="border-b p-2">
                      {b.market_key} • {b.outcome_name ?? b.outcome_key}
                      {b.line === null ? "" : ` (${b.line})`} @ {b.odds_price_used}
                    </td>
                    <td className="border-b p-2">{b.stake}</td>
                    <td className="border-b p-2">{b.settlement ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

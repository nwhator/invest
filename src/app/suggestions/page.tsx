import Link from "next/link";
import { getDailySuggestions } from "@/lib/data/suggestions";

export const dynamic = "force-dynamic";

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function formatUtc(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

export default async function SuggestionsPage() {
  const suggestions = await getDailySuggestions({ hoursAhead: 24, minEv: 0.01, limit: 25 });

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="text-sm text-zinc-600">
        <Link className="underline" href="/">
          Events
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-semibold">Suggestions (next 24h)</h1>
      <p className="mt-2 text-sm text-zinc-600">
        MVP model: derives a fair probability from the latest odds snapshot (average implied probs across books, then
        normalized to remove vig). Suggestions are outcomes with positive estimated value.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-zinc-600">
              <th className="border-b p-3">Time</th>
              <th className="border-b p-3">Sport</th>
              <th className="border-b p-3">Event</th>
              <th className="border-b p-3">Market</th>
              <th className="border-b p-3">Outcome</th>
              <th className="border-b p-3">Best price</th>
              <th className="border-b p-3">Fair prob</th>
              <th className="border-b p-3">EV</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.length === 0 ? (
              <tr>
                <td className="p-3 text-zinc-600" colSpan={8}>
                  No suggestions found. This usually means not enough odds/bookmakers are ingested yet.
                </td>
              </tr>
            ) : (
              suggestions.map((s) => (
                <tr key={`${s.eventId}|${s.marketKey}|${s.outcomeKey}|${s.line ?? ""}`}>
                  <td className="border-b p-3 whitespace-nowrap">{formatUtc(s.commenceTimeUtc)}</td>
                  <td className="border-b p-3 font-mono text-xs">{s.sportKey}</td>
                  <td className="border-b p-3">
                    <Link className="underline" href={`/events/${s.eventId}`}>
                      {s.homeName} vs {s.awayName}
                    </Link>
                  </td>
                  <td className="border-b p-3">
                    {s.marketKey}
                    {s.line === null ? "" : ` (${s.line})`}
                  </td>
                  <td className="border-b p-3">{s.outcomeName ?? s.outcomeKey}</td>
                  <td className="border-b p-3">
                    {s.bestPrice} <span className="text-xs text-zinc-500">({s.bestBookmaker})</span>
                  </td>
                  <td className="border-b p-3">{pct(s.fairProb)}</td>
                  <td className="border-b p-3">{pct(s.ev)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <div className="text-sm font-medium">Important</div>
        <p className="mt-1 text-sm text-zinc-600">
          This site does not place bets. It only generates suggestions. There is no guarantee of profit.
        </p>
      </div>
    </main>
  );
}

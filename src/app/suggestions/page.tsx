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
  const suggestions = await getDailySuggestions({ hoursAhead: 24, minEv: 0.0, limit: 25, prioritizeTennis: true });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600">
          <Link className="underline decoration-zinc-300 hover:decoration-zinc-600" href="/">
            Events
          </Link>
        </div>
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Suggestions (next 24h)</h1>
      <p className="mt-2 text-sm text-zinc-600">
        MVP model: derives a fair probability from the latest odds snapshot (average implied probs across books, then
        normalized to remove vig). Suggestions prefer tennis first and smaller odds (lowest price) for rollover-style play.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left text-zinc-600">
              <th className="border-b border-zinc-200 p-3">Time</th>
              <th className="border-b border-zinc-200 p-3">Sport</th>
              <th className="border-b border-zinc-200 p-3">Event</th>
              <th className="border-b border-zinc-200 p-3">Market</th>
              <th className="border-b border-zinc-200 p-3">Outcome</th>
              <th className="border-b border-zinc-200 p-3">Lowest price</th>
              <th className="border-b border-zinc-200 p-3">Fair prob</th>
              <th className="border-b border-zinc-200 p-3">EV</th>
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
                <tr key={`${s.eventId}|${s.marketKey}|${s.outcomeKey}|${s.line ?? ""}`} className="hover:bg-zinc-50">
                  <td className="border-b border-zinc-100 p-3 whitespace-nowrap">{formatUtc(s.commenceTimeUtc)}</td>
                  <td className="border-b border-zinc-100 p-3 font-mono text-xs text-zinc-700">{s.sportKey}</td>
                  <td className="border-b border-zinc-100 p-3">
                    <Link className="underline decoration-zinc-300 hover:decoration-zinc-600" href={`/events/${s.eventId}`}>
                      {s.homeName} vs {s.awayName}
                    </Link>
                  </td>
                  <td className="border-b border-zinc-100 p-3 text-zinc-700">
                    {s.marketKey}
                    {s.line === null ? "" : ` (${s.line})`}
                  </td>
                  <td className="border-b border-zinc-100 p-3 text-zinc-700">{s.outcomeName ?? s.outcomeKey}</td>
                  <td className="border-b border-zinc-100 p-3 text-zinc-700">
                    {s.bestPrice} <span className="text-xs text-zinc-500">({s.bestBookmaker})</span>
                  </td>
                  <td className="border-b border-zinc-100 p-3 text-zinc-700">{pct(s.fairProb)}</td>
                  <td className="border-b border-zinc-100 p-3 text-zinc-700">{pct(s.ev)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-medium">Important</div>
        <p className="mt-1 text-sm text-zinc-600">
          This site does not place bets. It only generates suggestions. There is no guarantee of profit.
        </p>
      </div>
    </main>
  );
}

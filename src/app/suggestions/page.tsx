import Link from "next/link";
import { getDailySuggestions } from "@/lib/data/suggestions";

export const dynamic = "force-dynamic";

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function evTone(ev: number): { cls: string; label: string } {
  if (!Number.isFinite(ev)) return { cls: "text-zinc-700", label: "—" };
  if (ev > 0) return { cls: "text-emerald-700", label: `+${pct(ev)}` };
  if (ev < 0) return { cls: "text-rose-700", label: pct(ev) };
  return { cls: "text-zinc-700", label: pct(ev) };
}

function formatUtc(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

type Props = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function SuggestionsPage({ searchParams }: Props) {
  const pageSize = 25;
  const sp = (await searchParams) ?? {};
  const rawPage = Number(sp.page ?? "1");
  const pageFromUrl = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  // Suggestions are computed from latest snapshots (not a DB table), so pagination is done after generation.
  // Keep an upper bound so this stays fast.
  const all = await getDailySuggestions({ hoursAhead: 24, minEv: 0.0, limit: 2000, prioritizeTennis: false });
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const page = Math.min(Math.max(1, pageFromUrl), totalPages);

  const suggestions = all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600">
          <Link className="underline decoration-zinc-300 hover:decoration-zinc-600" href="/">
            Events
          </Link>
        </div>
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Suggestions (next 24h)</h1>
      <p className="mt-2 text-sm text-zinc-600">
        MVP model: derives a fair probability from the latest odds snapshot (median implied probs across books, then normalized
        to remove vig). It filters out outcomes with too few books and prefers higher-consensus prices (lower disagreement).
        The table is sorted for rollover-style play (smaller odds first).
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200/80 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left text-zinc-600">
              <th className="border-b border-zinc-200 p-2 sm:p-3">Time</th>
              <th className="hidden border-b border-zinc-200 p-2 sm:table-cell sm:p-3">Sport</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">Event</th>
              <th className="hidden border-b border-zinc-200 p-2 md:table-cell sm:p-3">Market</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">Outcome</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">Lowest price</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">Fair prob</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">EV</th>
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
                  <td className="border-b border-zinc-100 p-2 sm:p-3 whitespace-nowrap">{formatUtc(s.commenceTimeUtc)}</td>
                  <td className="hidden border-b border-zinc-100 p-2 sm:table-cell sm:p-3 font-mono text-xs text-zinc-700">{s.sportKey}</td>
                  <td className="border-b border-zinc-100 p-2 sm:p-3">
                    <Link className="font-medium text-indigo-700 underline decoration-indigo-200 hover:text-indigo-800 hover:decoration-indigo-400" href={`/events/${s.eventId}`}>
                      {s.homeName} vs {s.awayName}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500 sm:hidden">
                      <span className="font-mono">{s.sportKey}</span>
                    </div>
                  </td>
                  <td className="hidden border-b border-zinc-100 p-2 md:table-cell sm:p-3 text-zinc-700">
                    {s.marketKey}
                    {s.line === null ? "" : ` (${s.line})`}
                  </td>
                  <td className="border-b border-zinc-100 p-2 sm:p-3 text-zinc-700">{s.outcomeName ?? s.outcomeKey}</td>
                  <td className="border-b border-zinc-100 p-2 sm:p-3 text-zinc-700">
                    {s.bestPrice} <span className="text-xs text-zinc-500">({s.bestBookmaker})</span>
                  </td>
                  <td className="border-b border-zinc-100 p-2 sm:p-3 text-zinc-800">{pct(s.fairProb)}</td>
                  <td className={`border-b border-zinc-100 p-2 sm:p-3 font-medium ${evTone(s.ev).cls}`}>{evTone(s.ev).label}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
        <div>
          Page <span className="font-medium text-zinc-800">{page}</span> of {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <Link
            className={`rounded-md border px-3 py-1.5 shadow-sm ${
              hasPrev ? "border-zinc-200/80 bg-white hover:bg-zinc-50" : "border-zinc-200 bg-zinc-100 text-zinc-400"
            }`}
            href={hasPrev ? `/suggestions?page=${page - 1}` : "/suggestions"}
            aria-disabled={!hasPrev}
            tabIndex={hasPrev ? 0 : -1}
          >
            Prev
          </Link>
          <Link
            className={`rounded-md border px-3 py-1.5 shadow-sm ${
              hasNext ? "border-zinc-200/80 bg-white hover:bg-zinc-50" : "border-zinc-200 bg-zinc-100 text-zinc-400"
            }`}
            href={hasNext ? `/suggestions?page=${page + 1}` : `/suggestions?page=${page}`}
            aria-disabled={!hasNext}
            tabIndex={hasNext ? 0 : -1}
          >
            Next
          </Link>
        </div>
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

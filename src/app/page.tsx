import Link from "next/link";
import { listUpcomingEventsPaged } from "@/lib/data/events";

export const dynamic = "force-dynamic";

function formatUtc(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

type Props = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const pageSize = 25;

  const sp = (await searchParams) ?? {};
  const rawPage = Number(sp.page ?? "1");
  const pageFromUrl = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const first = await listUpcomingEventsPaged({ page: pageFromUrl, pageSize });
  const totalPages = Math.max(1, Math.ceil(first.totalCount / pageSize));
  const page = Math.min(Math.max(1, pageFromUrl), totalPages);

  // If the requested page was out of range, fetch the clamped page.
  const { rows: events, totalCount } = page === pageFromUrl ? first : await listUpcomingEventsPaged({ page, pageSize });
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-zinc-600">Upcoming events ingested into Supabase.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          className="inline-flex items-center rounded-md border border-zinc-200/80 bg-white px-3 py-1.5 text-zinc-800 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
          href="/suggestions"
        >
          Suggestions
        </Link>
        <Link
          className="inline-flex items-center rounded-md border border-zinc-200/80 bg-white px-3 py-1.5 text-zinc-800 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
          href="/admin/ingest-odds"
        >
          Admin: ingest odds
        </Link>
        <Link
          className="inline-flex items-center rounded-md border border-zinc-200/80 bg-white px-3 py-1.5 text-zinc-800 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
          href="/admin/results"
        >
          Admin: results
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200/80 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left text-zinc-600">
              <th className="border-b border-zinc-200 p-2 sm:p-3">Time</th>
              <th className="hidden border-b border-zinc-200 p-2 sm:table-cell sm:p-3">Sport</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">Match</th>
              <th className="hidden border-b border-zinc-200 p-2 sm:table-cell sm:p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td className="p-3 text-zinc-600" colSpan={4}>
                  No upcoming events yet. Use Admin: ingest odds to populate.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="hover:bg-zinc-50">
                  <td className="border-b border-zinc-100 p-2 sm:p-3 whitespace-nowrap">{formatUtc(e.commence_time_utc)}</td>
                  <td className="hidden border-b border-zinc-100 p-2 sm:table-cell sm:p-3 font-mono text-xs text-zinc-700">{e.sport_key}</td>
                  <td className="border-b border-zinc-100 p-2 sm:p-3">
                    <Link className="font-medium text-indigo-700 underline decoration-indigo-200 hover:text-indigo-800 hover:decoration-indigo-400" href={`/events/${e.id}`}>
                      {e.home_name} vs {e.away_name}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500 sm:hidden">
                      <span className="font-mono">{e.sport_key}</span> • {e.status}
                    </div>
                  </td>
                  <td className="hidden border-b border-zinc-100 p-2 sm:table-cell sm:p-3 text-zinc-700">{e.status}</td>
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
            href={hasPrev ? `/?page=${page - 1}` : "/"}
            aria-disabled={!hasPrev}
            tabIndex={hasPrev ? 0 : -1}
          >
            Prev
          </Link>
          <Link
            className={`rounded-md border px-3 py-1.5 shadow-sm ${
              hasNext ? "border-zinc-200/80 bg-white hover:bg-zinc-50" : "border-zinc-200 bg-zinc-100 text-zinc-400"
            }`}
            href={hasNext ? `/?page=${page + 1}` : `/?page=${page}`}
            aria-disabled={!hasNext}
            tabIndex={hasNext ? 0 : -1}
          >
            Next
          </Link>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { listUpcomingEvents } from "@/lib/data/events";

export const dynamic = "force-dynamic";

function formatUtc(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

export default async function Home() {
  const events = await listUpcomingEvents(50);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-zinc-600">Upcoming events ingested into Supabase.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-zinc-800 shadow-sm hover:bg-zinc-50"
          href="/suggestions"
        >
          Suggestions
        </Link>
        <Link
          className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-zinc-800 shadow-sm hover:bg-zinc-50"
          href="/admin/ingest-odds"
        >
          Admin: ingest odds
        </Link>
        <Link
          className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-zinc-800 shadow-sm hover:bg-zinc-50"
          href="/admin/results"
        >
          Admin: results
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left text-zinc-600">
              <th className="border-b border-zinc-200 p-3">Time</th>
              <th className="border-b border-zinc-200 p-3">Sport</th>
              <th className="border-b border-zinc-200 p-3">Match</th>
              <th className="border-b border-zinc-200 p-3">Status</th>
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
                  <td className="border-b border-zinc-100 p-3 whitespace-nowrap">{formatUtc(e.commence_time_utc)}</td>
                  <td className="border-b border-zinc-100 p-3 font-mono text-xs text-zinc-700">{e.sport_key}</td>
                  <td className="border-b border-zinc-100 p-3">
                    <Link className="underline decoration-zinc-300 hover:decoration-zinc-600" href={`/events/${e.id}`}>
                      {e.home_name} vs {e.away_name}
                    </Link>
                  </td>
                  <td className="border-b border-zinc-100 p-3 text-zinc-700">{e.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

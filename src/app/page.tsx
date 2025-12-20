import Link from "next/link";
import { listUpcomingEvents } from "@/lib/data/events";

export const dynamic = "force-dynamic";

function formatUtc(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

export default async function Home() {
  const events = await listUpcomingEvents(50);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Events</h1>
      <p className="mt-2 text-sm text-zinc-600">Upcoming events ingested into Supabase.</p>

      <div className="mt-4 flex gap-4 text-sm">
        <Link className="underline" href="/suggestions">
          Suggestions
        </Link>
        <Link className="underline" href="/admin/ingest-odds">
          Admin: ingest odds
        </Link>
        <Link className="underline" href="/admin/results">
          Admin: results
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-zinc-600">
              <th className="border-b p-3">Time</th>
              <th className="border-b p-3">Sport</th>
              <th className="border-b p-3">Match</th>
              <th className="border-b p-3">Status</th>
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
                <tr key={e.id}>
                  <td className="border-b p-3 whitespace-nowrap">{formatUtc(e.commence_time_utc)}</td>
                  <td className="border-b p-3 font-mono text-xs">{e.sport_key}</td>
                  <td className="border-b p-3">
                    <Link className="underline" href={`/events/${e.id}`}>
                      {e.home_name} vs {e.away_name}
                    </Link>
                  </td>
                  <td className="border-b p-3">{e.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

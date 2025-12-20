"use client";

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminResultsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="text-sm text-zinc-600">
        <Link className="underline decoration-zinc-300 hover:decoration-zinc-600" href="/">
          Events
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Admin: enter result</h1>
      <p className="mt-2 text-sm text-zinc-600">
        MVP tool: posts a final score for an event and settles any un-settled <span className="font-mono">h2h</span> picks.
      </p>

      <form
        className="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);

          const eventId = String(fd.get("eventId") ?? "");
          const homeScore = Number(fd.get("homeScore"));
          const awayScore = Number(fd.get("awayScore"));
          const secret = String(fd.get("secret") ?? "");

          fetch(`/api/admin/results?secret=${encodeURIComponent(secret)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ eventId, homeScore, awayScore }),
          })
            .then(async (r) => {
              const json = await r.json();
              if (!json.ok) throw new Error(json.error ?? "Failed");
              alert(`Saved. Winner: ${json.winnerKey}`);
            })
            .catch((err) => {
              alert(err instanceof Error ? err.message : "Failed");
            });
        }}
      >
        <label className="grid gap-1">
          <span className="text-sm text-zinc-700">Admin secret</span>
          <input
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400"
            name="secret"
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-zinc-700">Event ID (UUID)</span>
          <input
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400"
            name="eventId"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-zinc-700">Home score</span>
            <input
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
              name="homeScore"
              type="number"
              min={0}
              step={1}
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-zinc-700">Away score</span>
            <input
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
              name="awayScore"
              type="number"
              min={0}
              step={1}
              required
            />
          </label>
        </div>

        <button
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          type="submit"
        >
          Save result + settle
        </button>

        <p className="text-xs text-zinc-500">
          Add <span className="font-mono">ADMIN_SECRET</span> to your env vars before using.
        </p>
      </form>
    </main>
  );
}

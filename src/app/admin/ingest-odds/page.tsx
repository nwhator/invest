"use client";

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminIngestOddsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="text-sm text-zinc-600">
        <Link className="underline decoration-zinc-300 hover:decoration-zinc-600" href="/">
          Events
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Admin: ingest odds</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Manually fetches the latest odds from The Odds API and writes events + snapshots to Supabase.
      </p>

      <p className="mt-2 text-sm text-zinc-600">
        Need sport keys? Use the admin endpoint: <span className="font-mono">/api/admin/odds-sports</span>
      </p>

      <form
        className="mt-6 grid gap-3 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const secret = String(fd.get("secret") ?? "");

          fetch(`/api/admin/ingest-odds?secret=${encodeURIComponent(secret)}`, {
            method: "POST",
          })
            .then(async (r) => {
              const json = await r.json();
              if (!json.ok) throw new Error(json.error ?? "Failed");
              alert(`Done. Upserted events: ${json.upsertedEvents}. Inserted snapshots: ${json.insertedSnapshots}.`);
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

        <button
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
          type="submit"
        >
          Ingest odds now
        </button>

        <p className="text-xs text-zinc-500">
          Add <span className="font-mono">ADMIN_SECRET</span> to your env vars before using.
        </p>
      </form>
    </main>
  );
}

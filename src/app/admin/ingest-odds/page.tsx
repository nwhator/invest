"use client";

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminIngestOddsPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="text-sm text-zinc-600">
        <Link className="underline" href="/">
          Events
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-semibold">Admin: ingest odds</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Manually fetches the latest odds from The Odds API and writes events + snapshots to Supabase.
      </p>

      <form
        className="mt-6 grid gap-3"
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
          <input className="rounded border px-3 py-2 text-sm" name="secret" required />
        </label>

        <button className="rounded bg-black px-3 py-2 text-sm text-white" type="submit">
          Ingest odds now
        </button>

        <p className="text-xs text-zinc-500">
          Add <span className="font-mono">ADMIN_SECRET</span> to your env vars before using.
        </p>
      </form>
    </main>
  );
}

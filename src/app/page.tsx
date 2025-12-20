export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Betting prediction scaffold</h1>
      <p className="mt-2 text-sm text-zinc-600">
        This project is wired for Supabase + Vercel Cron and includes a first ingestion endpoint.
      </p>

      <div className="mt-6 space-y-2 rounded-lg border p-4">
        <div className="text-sm font-medium">Setup</div>
        <ul className="list-disc pl-5 text-sm text-zinc-700">
          <li>
            Run the SQL in <span className="font-mono">supabase/schema.sql</span> in your Supabase project.
          </li>
          <li>
            Create <span className="font-mono">.env.local</span> from <span className="font-mono">.env.example</span>.
          </li>
          <li>Deploy to Vercel and set the same env vars there.</li>
        </ul>
      </div>

      <div className="mt-6 space-y-2 rounded-lg border p-4">
        <div className="text-sm font-medium">Cron endpoints</div>
        <ul className="list-disc pl-5 text-sm text-zinc-700">
          <li>
            <span className="font-mono">/api/cron/ingest-odds</span>
          </li>
          <li>
            <span className="font-mono">/api/cron/quality-check</span> (placeholder)
          </li>
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          On Vercel Cron these routes are authorized automatically. Locally you can set
          <span className="font-mono"> CRON_SECRET</span> and call with
          <span className="font-mono"> ?secret=...</span>.
        </p>
      </div>
    </main>
  );
}

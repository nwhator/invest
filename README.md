# Betting prediction MVP (Next.js + Supabase)

This repo is an MVP scaffold for:

- ingesting odds from The Odds API into Supabase
- letting friends save simple picks against the latest odds snapshot
- manually entering results (admin secret) to settle **h2h** picks

This app does **not** place bets. It only generates suggestions and tracks picks.

## Supabase setup

1) Run the SQL schema in [supabase/schema.sql](supabase/schema.sql) using the Supabase SQL editor.

2) Add environment variables (locally and on Vercel)

Use [.env.example](.env.example) as a template.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `ODDS_API_KEY`

Optional:

- `ADMIN_SECRET` (protects admin endpoints)

## Local dev

```bash
npm install
npm run dev
```

Homepage shows upcoming events from Supabase.

## Ingest odds

This project does not rely on scheduled cron jobs.

Manual trigger options (requires `ADMIN_SECRET`):

- UI: `/admin/ingest-odds`
- API: `POST http://localhost:3000/api/admin/ingest-odds?secret=YOUR_ADMIN_SECRET`

## Use the UI

- `/` lists upcoming events
- `/suggestions` shows “pick ideas” for the next 24h
- `/events/:eventId` shows latest odds and lets you save a friend pick
- `/admin/ingest-odds` lets you manually ingest odds (requires `ADMIN_SECRET`)
- `/admin/results` lets you enter a final score (requires `ADMIN_SECRET`)

## Enter results + settle picks

The admin endpoint settles only **h2h** picks for now.

1) Go to `/admin/results`
2) Paste `ADMIN_SECRET`
3) Paste the event UUID from the event page URL
4) Enter the final score and submit

This writes to `results`, sets `events.status='final'`, and settles any un-settled `bets` rows for that event.

## Notes

- This MVP uses server-side Supabase access via the service role key. Do not expose the service role key to the browser.
- Odds ingestion stores append-only snapshots in `odds_snapshots`.

## ML (optional)

There is a starter ML folder at [ml/](ml/) and a GitHub Actions workflow at [.github/workflows/ml-train.yml](.github/workflows/ml-train.yml).

To enable it:

- Add repo secrets: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Run the workflow manually (Actions tab) or wait for the nightly schedule

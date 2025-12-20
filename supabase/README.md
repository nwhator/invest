# Supabase schema

- Run [schema.sql](schema.sql) in the Supabase SQL editor.
- Then add the env vars from [.env.example](../.env.example) into Vercel and/or your local `.env.local`.

Tables:
- `events`: canonical match records (keyed by provider event id)
- `odds_snapshots`: append-only odds points over time
- `results`: final outcomes (to be ingested later)
- `predictions`: model outputs (to be produced later)

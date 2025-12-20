# ML (starter)

This folder is a starter for experimenting with machine learning to improve suggestions over time.

Recommended approach:

- Keep the **web app** (Next.js on Vercel) focused on UI + ingestion.
- Run **training** off-platform (e.g., GitHub Actions scheduled job) and write predictions back into Supabase.

## Minimal idea

1) Pull historical rows from Supabase:

- `events`
- `odds_snapshots` (use only snapshots taken before event start)
- `results`

1) Build features (examples):

- best price / avg price per outcome
- implied probabilities + no-vig normalized probabilities
- line movement between snapshots (if you store multiple snapshots)

1) Train a model (start simple):

- Logistic Regression as a baseline
- LightGBM/XGBoost for stronger tabular performance

1) Write outputs to `predictions`:

- `event_id, market_key, outcome_key, line, model_version, predicted_prob, generated_time_utc`

## Secrets

Use GitHub Actions repo secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Never commit real keys to the repo.

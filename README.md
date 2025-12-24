# Arbitrage scanner MVP (Next.js)

This repo is an MVP scaffold for:

- pulling live arbitrage candidates from RapidAPI (sportsbook-api2)
- enforcing strict 2-way only (no draws / no 1X2)
- computing ROI + a stake split to lock in profit

This app does **not** place bets. It only surfaces opportunities and a stake plan.

## Setup

Use [.env.example](.env.example) as a template.

Required:

- `RAPIDAPI_KEY`

Optional:

- `RAPIDAPI_HOST` (defaults to `sportsbook-api2.p.rapidapi.com`)

## Local dev

```bash
npm install
npm run dev
```

Homepage redirects to the arbitrage scanner.

## Data source

Arbitrage candidates come directly from RapidAPI sportsbook-api2.

## Use the UI

- `/suggestions` shows arbitrage opportunities

## Check RapidAPI connectivity

- `/api/health/rapidapi` returns a quick status + counts (useful for verifying `RAPIDAPI_KEY` and diagnosing 401/429 errors)

## Notes

- RapidAPI responses are fetched server-side.

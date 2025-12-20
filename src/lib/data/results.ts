import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function upsertResult(input: {
  eventId: string;
  homeScore: number;
  awayScore: number;
  winnerKey: "home" | "away" | "draw";
}) {
  const sb = supabaseAdmin();

  const finalTimeUtc = new Date().toISOString();

  const { error: resErr } = await sb
    .from("results")
    .upsert(
      {
        event_id: input.eventId,
        home_score: input.homeScore,
        away_score: input.awayScore,
        winner_key: input.winnerKey,
        final_time_utc: finalTimeUtc,
      },
      { onConflict: "event_id" }
    );

  if (resErr) throw new Error(resErr.message);

  const { error: evErr } = await sb.from("events").update({ status: "final" }).eq("id", input.eventId);
  if (evErr) throw new Error(evErr.message);
}

export async function settleBetsForEvent(eventId: string, winnerKey: "home" | "away" | "draw") {
  // MVP settlement rules:
  // - h2h: win if outcome_key matches winner (or outcome_name matches team)
  // - other markets: leave unsettled (you can extend later)

  const sb = supabaseAdmin();

  const { data: bets, error: betsErr } = await sb
    .from("bets")
    .select("id,market_key,outcome_key,outcome_name,line,odds_price_used,stake")
    .eq("event_id", eventId)
    .is("settlement", null);

  if (betsErr) throw new Error(betsErr.message);

  for (const bet of bets ?? []) {
    const marketKey = String(bet.market_key);
    if (marketKey !== "h2h") continue;

    const outcomeKey = String(bet.outcome_key);
    const settlement = outcomeKey === winnerKey ? "win" : "lose";

    const stake = Number(bet.stake);
    const odds = Number(bet.odds_price_used);
    const payout = settlement === "win" ? stake * odds : 0;

    const { error: updErr } = await sb
      .from("bets")
      .update({ settlement, payout })
      .eq("id", bet.id);

    if (updErr) throw new Error(updErr.message);
  }
}

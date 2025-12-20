import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BetRow = {
  id: string;
  event_id: string;
  friend_name: string;
  market_key: string;
  outcome_key: string;
  outcome_name: string | null;
  line: number | null;
  odds_price_used: number;
  stake: number;
  placed_time_utc: string;
  settlement: string | null;
  payout: number | null;
};

export async function listBetsForEvent(eventId: string, limit = 50): Promise<BetRow[]> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("bets")
    .select(
      "id,event_id,friend_name,market_key,outcome_key,outcome_name,line,odds_price_used,stake,placed_time_utc,settlement,payout"
    )
    .eq("event_id", eventId)
    .order("placed_time_utc", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as BetRow[];
}

export type CreateBetInput = {
  eventId: string;
  friendName: string;
  marketKey: string;
  outcomeKey: string;
  outcomeName?: string | null;
  line?: number | null;
  oddsPriceUsed: number;
  stake: number;
};

export async function createBet(input: CreateBetInput): Promise<BetRow> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("bets")
    .insert({
      event_id: input.eventId,
      friend_name: input.friendName,
      market_key: input.marketKey,
      outcome_key: input.outcomeKey,
      outcome_name: input.outcomeName ?? null,
      line: input.line ?? null,
      odds_price_used: input.oddsPriceUsed,
      stake: input.stake,
    })
    .select(
      "id,event_id,friend_name,market_key,outcome_key,outcome_name,line,odds_price_used,stake,placed_time_utc,settlement,payout"
    )
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create bet");
  return data as BetRow;
}

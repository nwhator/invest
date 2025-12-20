import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type EventRow = {
  id: string;
  sport_key: string;
  league_key: string | null;
  commence_time_utc: string;
  home_name: string;
  away_name: string;
  status: string;
};

export async function listUpcomingEvents(limit = 50): Promise<EventRow[]> {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from("events")
    .select("id,sport_key,league_key,commence_time_utc,home_name,away_name,status")
    .gte("commence_time_utc", nowIso)
    .order("commence_time_utc", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

export async function getEventById(eventId: string): Promise<EventRow | null> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("events")
    .select("id,sport_key,league_key,commence_time_utc,home_name,away_name,status")
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as EventRow) ?? null;
}

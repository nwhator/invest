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

export async function listUpcomingEventsPaged(opts?: { page?: number; pageSize?: number }): Promise<{
  rows: EventRow[];
  totalCount: number;
}> {
  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const pageSize = Math.max(1, Math.min(100, opts?.pageSize ?? 25));
  const page = Math.max(1, opts?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await sb
    .from("events")
    .select("id,sport_key,league_key,commence_time_utc,home_name,away_name,status", { count: "exact" })
    .gte("commence_time_utc", nowIso)
    .order("commence_time_utc", { ascending: true })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as EventRow[], totalCount: count ?? 0 };
}

export async function listUpcomingEvents(limit = 50): Promise<EventRow[]> {
  const pageSize = Math.max(1, Math.min(100, limit));
  const { rows } = await listUpcomingEventsPaged({ page: 1, pageSize });
  return rows;
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

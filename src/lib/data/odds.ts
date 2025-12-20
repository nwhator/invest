import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OddsSnapshotRow = {
  id: string;
  event_id: string;
  provider: string;
  bookmaker: string;
  market_key: string;
  outcome_key: string;
  outcome_name: string | null;
  line: number | null;
  price: number;
  snapshot_time_utc: string;
};

export type LatestOddsGroup = {
  snapshotTimeUtc: string;
  rows: OddsSnapshotRow[];
};

export async function getLatestOddsForEvent(eventId: string, limit = 500): Promise<LatestOddsGroup | null> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("odds_snapshots")
    .select(
      "id,event_id,provider,bookmaker,market_key,outcome_key,outcome_name,line,price,snapshot_time_utc"
    )
    .eq("event_id", eventId)
    .order("snapshot_time_utc", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OddsSnapshotRow[];
  if (!rows.length) return null;

  const snapshotTimeUtc = rows[0]!.snapshot_time_utc;
  const latestRows = rows.filter((r) => r.snapshot_time_utc === snapshotTimeUtc);

  return { snapshotTimeUtc, rows: latestRows };
}

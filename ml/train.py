import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import pandas as pd
from sklearn.linear_model import LogisticRegression
from supabase import create_client


MODEL_VERSION = "lr_tennis_h2h_v1"


def _chunked(xs: List[str], size: int) -> List[List[str]]:
    return [xs[i : i + size] for i in range(0, len(xs), size)]


def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def _pick_latest_snapshot_before(
    odds: pd.DataFrame, event_id: str, commence_time_utc: pd.Timestamp
) -> Optional[pd.Timestamp]:
    ev = odds[odds["event_id"] == event_id]
    if ev.empty:
        return None

    ev = ev.copy()
    ev["snapshot_time_utc"] = pd.to_datetime(ev["snapshot_time_utc"], utc=True, errors="coerce")
    ev = ev.dropna(subset=["snapshot_time_utc"])

    before = ev[ev["snapshot_time_utc"] <= commence_time_utc]
    if not before.empty:
        return before["snapshot_time_utc"].max()

    return ev["snapshot_time_utc"].max()


def _extract_best_prices_for_event(
    odds: pd.DataFrame,
    event_id: str,
    snapshot_time_utc: pd.Timestamp,
    home_name: str,
    away_name: str,
) -> Optional[Tuple[float, float]]:
    ev = odds[(odds["event_id"] == event_id) & (odds["snapshot_time_utc"] == snapshot_time_utc)]
    if ev.empty:
        return None

    home = _norm(home_name)
    away = _norm(away_name)

    def side_for_row(row: pd.Series) -> Optional[str]:
        ok = _norm(row.get("outcome_key"))
        on = _norm(row.get("outcome_name"))
        if ok in ("home", "away"):
            return ok
        if on == home:
            return "home"
        if on == away:
            return "away"
        return None

    ev = ev.copy()
    ev["side"] = ev.apply(side_for_row, axis=1)
    ev = ev[ev["side"].isin(["home", "away"])].copy()
    if ev.empty:
        return None

    home_price = ev[ev["side"] == "home"]["price"].min()
    away_price = ev[ev["side"] == "away"]["price"].min()

    if pd.isna(home_price) or pd.isna(away_price):
        return None

    home_price_f = float(home_price)
    away_price_f = float(away_price)
    if home_price_f <= 1.0 or away_price_f <= 1.0:
        return None

    return home_price_f, away_price_f


def _build_training_frame(results_rows: pd.DataFrame, odds_rows: pd.DataFrame) -> pd.DataFrame:
    results_rows = results_rows.copy()
    results_rows["commence_time_utc"] = pd.to_datetime(
        results_rows["commence_time_utc"], utc=True, errors="coerce"
    )
    results_rows = results_rows.dropna(subset=["commence_time_utc"])

    odds_rows = odds_rows.copy()
    odds_rows["snapshot_time_utc"] = pd.to_datetime(odds_rows["snapshot_time_utc"], utc=True, errors="coerce")
    odds_rows = odds_rows.dropna(subset=["snapshot_time_utc"])

    records: List[Dict] = []

    for _, r in results_rows.iterrows():
        event_id = str(r["event_id"])
        winner = str(r["winner_key"])
        if winner not in ("home", "away"):
            continue

        commence = r["commence_time_utc"]
        snap = _pick_latest_snapshot_before(odds_rows, event_id, commence)
        if snap is None:
            continue

        best = _extract_best_prices_for_event(
            odds_rows,
            event_id,
            snap,
            str(r["home_name"]),
            str(r["away_name"]),
        )
        if best is None:
            continue

        home_price, away_price = best
        imp_home = 1.0 / home_price
        imp_away = 1.0 / away_price
        denom = imp_home + imp_away
        if denom <= 0:
            continue

        p_home_novig = imp_home / denom

        records.append(
            {
                "event_id": event_id,
                "p_home_novig": p_home_novig,
                "y_home": 1 if winner == "home" else 0,
            }
        )

    return pd.DataFrame.from_records(records)


def _fetch_finished_tennis_with_results(sb, limit: int) -> pd.DataFrame:
    res = (
        sb.table("results")
        .select(
            "event_id,winner_key,events!inner(sport_key,commence_time_utc,home_name,away_name)"
        )
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    data = res.data or []
    rows = []
    for r in data:
        ev = r.get("events") or {}
        sport_key = str(ev.get("sport_key") or "")
        if not sport_key.startswith("tennis_"):
            continue

        rows.append(
            {
                "event_id": r.get("event_id"),
                "winner_key": r.get("winner_key"),
                "sport_key": sport_key,
                "commence_time_utc": ev.get("commence_time_utc"),
                "home_name": ev.get("home_name"),
                "away_name": ev.get("away_name"),
            }
        )

    return pd.DataFrame.from_records(rows)


def _fetch_odds_for_events(sb, event_ids: List[str], market_key: str = "h2h") -> pd.DataFrame:
    all_rows: List[Dict] = []
    for chunk in _chunked(event_ids, 100):
        res = (
            sb.table("odds_snapshots")
            .select("event_id,outcome_key,outcome_name,price,snapshot_time_utc")
            .in_("event_id", chunk)
            .eq("market_key", market_key)
            .execute()
        )
        all_rows.extend(res.data or [])

    return pd.DataFrame.from_records(all_rows)


def _fetch_upcoming_tennis_events(sb, hours_ahead: int, limit: int) -> pd.DataFrame:
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=hours_ahead)

    res = (
        sb.table("events")
        .select("id,sport_key,commence_time_utc,home_name,away_name")
        .like("sport_key", "tennis_%")
        .gte("commence_time_utc", now.isoformat())
        .lte("commence_time_utc", end.isoformat())
        .order("commence_time_utc", desc=False)
        .limit(limit)
        .execute()
    )

    return pd.DataFrame.from_records(res.data or [])


def _write_predictions(sb, rows: List[Dict]) -> None:
    if not rows:
        return

    event_ids = sorted({r["event_id"] for r in rows})
    for chunk in _chunked(event_ids, 100):
        sb.table("predictions").delete().eq("model_version", MODEL_VERSION).in_("event_id", chunk).execute()

    sb.table("predictions").insert(rows).execute()


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 2

    sb = create_client(supabase_url, supabase_key)

    finished = _fetch_finished_tennis_with_results(sb, limit=1500)
    if finished.empty:
        print("No finished tennis results found; cannot train.")
        return 0

    event_ids = [str(x) for x in finished["event_id"].dropna().unique().tolist()]
    odds = _fetch_odds_for_events(sb, event_ids, market_key="h2h")

    train_df = _build_training_frame(finished, odds)
    if train_df.empty:
        print("Not enough aligned odds+results to train.")
        return 0

    X = train_df[["p_home_novig"]].to_numpy()
    y = train_df["y_home"].to_numpy()

    model = LogisticRegression(solver="lbfgs")
    model.fit(X, y)

    upcoming = _fetch_upcoming_tennis_events(sb, hours_ahead=48, limit=250)
    if upcoming.empty:
        print("No upcoming tennis events found.")
        return 0

    upcoming_ids = [str(x) for x in upcoming["id"].dropna().unique().tolist()]
    upcoming_odds = _fetch_odds_for_events(sb, upcoming_ids, market_key="h2h")
    if upcoming_odds.empty:
        print("No upcoming odds rows found; run ingestion first.")
        return 0

    now_iso = datetime.now(timezone.utc).isoformat()
    inserts: List[Dict] = []

    upcoming = upcoming.copy()
    upcoming["commence_time_utc"] = pd.to_datetime(upcoming["commence_time_utc"], utc=True, errors="coerce")

    for _, ev in upcoming.iterrows():
        event_id = str(ev["id"])
        commence_time = ev["commence_time_utc"]
        if pd.isna(commence_time):
            continue

        snap = _pick_latest_snapshot_before(upcoming_odds, event_id, commence_time)
        if snap is None:
            continue

        best = _extract_best_prices_for_event(
            upcoming_odds,
            event_id,
            snap,
            str(ev.get("home_name") or ""),
            str(ev.get("away_name") or ""),
        )
        if best is None:
            continue

        home_price, away_price = best
        imp_home = 1.0 / home_price
        imp_away = 1.0 / away_price
        denom = imp_home + imp_away
        if denom <= 0:
            continue

        p_home_novig = imp_home / denom
        p_home = float(model.predict_proba([[p_home_novig]])[0][1])
        p_away = 1.0 - p_home

        inserts.append(
            {
                "event_id": event_id,
                "market_key": "h2h",
                "outcome_key": "home",
                "line": None,
                "model_version": MODEL_VERSION,
                "predicted_prob": p_home,
                "generated_time_utc": now_iso,
            }
        )
        inserts.append(
            {
                "event_id": event_id,
                "market_key": "h2h",
                "outcome_key": "away",
                "line": None,
                "model_version": MODEL_VERSION,
                "predicted_prob": p_away,
                "generated_time_utc": now_iso,
            }
        )

    _write_predictions(sb, inserts)

    print(
        "ML trained and wrote predictions",
        {
            "model_version": MODEL_VERSION,
            "train_rows": int(train_df.shape[0]),
            "pred_rows": int(len(inserts)),
            "ran_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

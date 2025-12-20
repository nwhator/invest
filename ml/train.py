import os
import sys
from datetime import datetime, timezone

# Minimal placeholder training script.
# This is intentionally lightweight: it proves the wiring and gives you a place to start.


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 2

    # TODO: Implement data pull + training here.
    # Suggestion: use supabase-py and query `events`, `odds_snapshots`, `results`.

    print("ML placeholder ran at", datetime.now(timezone.utc).isoformat())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

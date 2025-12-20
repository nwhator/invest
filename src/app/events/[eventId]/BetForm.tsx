"use client";

import { useMemo, useState } from "react";

type OddsRow = {
  id: string;
  bookmaker: string;
  market_key: string;
  outcome_key: string;
  outcome_name: string | null;
  line: number | null;
  price: number;
};

type Props = {
  eventId: string;
  oddsRows: OddsRow[];
};

export default function BetForm({ eventId, oddsRows }: Props) {
  const [friendName, setFriendName] = useState("");
  const [stake, setStake] = useState(1);
  const [selection, setSelection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const options = useMemo(() => {
    return oddsRows.map((r) => {
      const value = [
        r.market_key,
        r.outcome_key,
        r.line ?? "",
        r.price,
        r.outcome_name ?? "",
      ].join("|");

      const label = `${r.market_key} • ${r.outcome_name ?? r.outcome_key}${
        r.line === null ? "" : ` (${r.line})`
      } @ ${r.price} (${r.bookmaker})`;

      return { key: r.id, value, label };
    });
  }, [oddsRows]);

  async function submit() {
    if (!selection) throw new Error("Select an outcome");

    const [marketKey, outcomeKey, lineStr, priceStr, outcomeName] = selection.split("|");

    const res = await fetch("/api/bets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId,
        friendName,
        stake,
        marketKey,
        outcomeKey,
        line: lineStr === "" ? null : Number(lineStr),
        oddsPriceUsed: Number(priceStr),
        outcomeName: outcomeName || null,
      }),
    });

    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) throw new Error(json.error ?? "Failed to save pick");
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <label className="grid gap-1">
        <span className="text-sm text-zinc-700">Friend name</span>
        <input
          className="rounded border px-3 py-2 text-sm"
          value={friendName}
          onChange={(e) => setFriendName(e.target.value)}
          placeholder="e.g. Nick"
          required
        />
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-zinc-700">Selection</span>
        <select
          className="rounded border px-3 py-2 text-sm"
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          required
          disabled={options.length === 0}
        >
          <option value="" disabled>
            {options.length ? "Select an outcome…" : "No odds available yet"}
          </option>
          {options.map((o) => (
            <option key={o.key} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1">
        <span className="text-sm text-zinc-700">Stake</span>
        <input
          className="rounded border px-3 py-2 text-sm"
          type="number"
          min={0.01}
          step={0.01}
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          required
        />
      </label>

      <button
        className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        type="button"
        disabled={isSubmitting || !friendName.trim() || !selection}
        onClick={async () => {
          try {
            setIsSubmitting(true);
            await submit();
            window.location.reload();
          } catch (err) {
            alert(err instanceof Error ? err.message : "Failed");
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        {isSubmitting ? "Saving…" : "Save pick"}
      </button>

      <p className="text-xs text-zinc-500">
        This is an MVP: it stores your selection and odds at time of pick.
      </p>
    </div>
  );
}

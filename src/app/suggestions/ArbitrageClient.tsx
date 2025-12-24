"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { stakePlan } from "@/lib/arbitrage/math";
import type { ArbOpportunity } from "@/lib/arbitrage/types";

function formatUtc(iso: string) {
  return new Date(iso).toLocaleString(undefined, { timeZoneName: "short" });
}

function fmtMoney(x: number) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${x.toFixed(2)}%`;
}

function fmtLine(x: number | null | undefined) {
  if (x == null) return "?";
  const n = Number(x);
  if (!Number.isFinite(n)) return "?";
  const s = String(n);
  return n > 0 ? `+${s}` : s;
}

function roiTone(roi: number) {
  if (!Number.isFinite(roi)) return "text-zinc-700";
  if (roi >= 2) return "text-emerald-700";
  if (roi >= 0.5) return "text-emerald-700";
  return "text-zinc-700";
}

export default function ArbitrageClient(props: {
  initial: ArbOpportunity[];
  initialLastUpdatedUtc: string;
  minRoiPercent: number;
  hoursAhead: number;
}) {
  const [opportunities, setOpportunities] = useState<ArbOpportunity[]>(props.initial);
  const [lastUpdatedUtc, setLastUpdatedUtc] = useState<string>(props.initialLastUpdatedUtc);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [bankroll, setBankroll] = useState<string>("100");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const bankrollValue = useMemo(() => {
    const n = Number(bankroll);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  }, [bankroll]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const qs = new URLSearchParams({
        hoursAhead: String(props.hoursAhead),
        minRoiPercent: String(props.minRoiPercent),
        limit: "500",
      });
      const res = await fetch(`/api/arbitrage?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { opportunities: ArbOpportunity[]; lastUpdatedUtc: string };
      setOpportunities(json.opportunities ?? []);
      setLastUpdatedUtc(json.lastUpdatedUtc ?? new Date().toISOString());
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      refresh().catch(() => {
        // Swallow refresh errors; UI remains usable.
      });
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Opportunities</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{opportunities.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Last update</div>
          <div className="mt-1 text-sm font-medium text-zinc-800">{formatUtc(lastUpdatedUtc)}</div>
        </div>
        <div className="rounded-xl border border-zinc-200/80 bg-white/70 p-4 shadow-sm backdrop-blur">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Bankroll</div>
          <div className="mt-1 flex items-center gap-2">
            <input
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-300"
              inputMode="decimal"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              aria-label="Bankroll"
            />
            <button
              type="button"
              onClick={() => refresh()}
              className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="mt-1 text-xs text-zinc-500">Auto-refreshes every 30s</div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200/80 bg-white/70 shadow-sm backdrop-blur">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-emerald-50/60 text-left text-zinc-700">
              <th className="border-b border-zinc-200 p-2 sm:p-3">Time</th>
              <th className="hidden border-b border-zinc-200 p-2 sm:table-cell sm:p-3">Sport</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">Event</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">Best odds</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3">ROI</th>
              <th className="border-b border-zinc-200 p-2 sm:p-3"></th>
            </tr>
          </thead>
          <tbody>
            {opportunities.length === 0 ? (
              <tr>
                <td className="p-3 text-zinc-600" colSpan={6}>
                  No arbitrage found. This can mean either (a) there are currently no true arbs, or (b) you have no recent
                  odds snapshots yet. Use Admin → ingest odds, then refresh.
                </td>
              </tr>
            ) : (
              opportunities.map((o) => {
                const expanded = expandedEventId === o.eventId;
                const plan = Number.isFinite(bankrollValue)
                  ? stakePlan(bankrollValue, { oddsA: o.bestOdds.A.odds, oddsB: o.bestOdds.B.odds })
                  : null;

                return (
                  <Fragment key={o.eventId}>
                    <tr className="hover:bg-zinc-50">
                      <td className="border-b border-zinc-100 p-2 sm:p-3 whitespace-nowrap">{formatUtc(o.startTimeUtc)}</td>
                      <td className="hidden border-b border-zinc-100 p-2 sm:table-cell sm:p-3">
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 font-mono text-xs text-indigo-700 ring-1 ring-inset ring-indigo-100">
                          {o.sport}
                        </span>
                      </td>
                      <td className="border-b border-zinc-100 p-2 sm:p-3">
                        <Link
                          className="font-medium text-indigo-700 underline decoration-indigo-200 hover:text-indigo-800 hover:decoration-indigo-400"
                          href={`/events/${o.eventId}`}
                        >
                          {o.outcomeLabels.A} vs {o.outcomeLabels.B}
                        </Link>
                        <div className="mt-1 text-xs text-zinc-500">
                          {o.marketKey === "h2h"
                            ? "h2h"
                            : `spreads: ${fmtLine(o.outcomeLines?.A)} / ${fmtLine(o.outcomeLines?.B)}`}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500 sm:hidden">
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[11px] text-indigo-700 ring-1 ring-inset ring-indigo-100">
                            {o.sport}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-zinc-100 p-2 sm:p-3 text-zinc-700">
                        <div className="whitespace-nowrap">
                          <span className="font-medium text-zinc-900">{o.bestOdds.A.odds}</span> {" "}
                          <span className="text-xs text-zinc-500">({o.bestOdds.A.bookmaker})</span>
                        </div>
                        <div className="whitespace-nowrap">
                          <span className="font-medium text-zinc-900">{o.bestOdds.B.odds}</span> {" "}
                          <span className="text-xs text-zinc-500">({o.bestOdds.B.bookmaker})</span>
                        </div>
                      </td>
                      <td className={`border-b border-zinc-100 p-2 sm:p-3 font-medium ${roiTone(o.roiPercent)}`}>{fmtPct(o.roiPercent)}</td>
                      <td className="border-b border-zinc-100 p-2 sm:p-3">
                        <button
                          type="button"
                          className="rounded-md border border-zinc-200/80 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-zinc-50"
                          onClick={() => setExpandedEventId(expanded ? null : o.eventId)}
                        >
                          {expanded ? "Hide" : "Calc"}
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td className="border-b border-zinc-100 p-3" colSpan={6}>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-zinc-200/80 bg-white/70 p-3">
                              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Stakes</div>
                              <div className="mt-2 text-sm text-zinc-800">
                                <div>
                                  {o.outcomeLabels.A}: <span className="font-semibold">{plan ? fmtMoney(plan.stakeA) : "—"}</span>
                                </div>
                                <div>
                                  {o.outcomeLabels.B}: <span className="font-semibold">{plan ? fmtMoney(plan.stakeB) : "—"}</span>
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">Total ≈ bankroll</div>
                            </div>
                            <div className="rounded-lg border border-zinc-200/80 bg-white/70 p-3">
                              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Guaranteed</div>
                              <div className="mt-2 text-sm text-zinc-800">
                                <div>
                                  Payout: <span className="font-semibold">{plan ? fmtMoney(plan.payout) : "—"}</span>
                                </div>
                                <div>
                                  Profit: <span className="font-semibold">{plan ? fmtMoney(plan.profit) : "—"}</span>
                                </div>
                                <div>
                                  ROI: <span className="font-semibold">{plan ? fmtPct(plan.roiPercent) : "—"}</span>
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">Assumes odds remain available when placed</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

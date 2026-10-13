"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/Card";
import { formatCurrency } from "@/lib/utils";
import { DEFAULT_CURRENCY_CODE } from "@/lib/currencies";

export type CurrencySummaryData = {
  currency: string;
  /** The signed-in member's totals in this currency. */
  oweSum: number;
  owedSum: number;
  net: number;
  debts: { fromId: string; fromName: string; toId: string; toName: string; amount: number }[];
};

/**
 * The dashboard's money block: a currency toggle plus the You owe / You're owed /
 * Net tiles and the Simplified Debts list, all switched together.
 *
 * The selected currency is component state and is NOT persisted — it resets to the
 * default (SGD) on every load and navigation, which is exactly the required
 * behaviour. All figures arrive pre-filtered to the signed-in member from the
 * server; switching the toggle only chooses which pre-computed block to show, so no
 * amount is ever summed across currencies.
 */
export function CurrencySummary({ summaries }: { summaries: CurrencySummaryData[] }) {
  const [selected, setSelected] = useState(
    summaries.find((s) => s.currency === DEFAULT_CURRENCY_CODE)?.currency ?? summaries[0]?.currency ?? DEFAULT_CURRENCY_CODE
  );
  const active = summaries.find((s) => s.currency === selected) ?? summaries[0];

  if (!active) return null;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {summaries.map((s) => (
          <button
            key={s.currency}
            type="button"
            onClick={() => setSelected(s.currency)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${s.currency === active.currency ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {s.currency}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <ArrowDownRight size={16} className="text-rose-500" />You owe
          </div>
          <p className="text-xl font-bold text-rose-700">{formatCurrency(active.oweSum, active.currency)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <ArrowUpRight size={16} className="text-emerald-700" />You&apos;re owed
          </div>
          <p className="text-xl font-bold text-emerald-700">{formatCurrency(active.owedSum, active.currency)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Minus size={16} className="text-slate-500" />Net
          </div>
          <p className={`text-xl font-bold ${active.net > 0 ? "text-emerald-700" : active.net < 0 ? "text-rose-700" : "text-slate-600"}`}>
            {formatCurrency(active.net, active.currency)}
          </p>
        </Card>
      </div>

      {active.debts.length > 0 && (
        <Card className="divide-y divide-slate-100">
          <div className="px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Simplified Debts</h2>
          </div>
          {active.debts.map((d, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3 text-sm">
              <span className="font-medium text-slate-900">{d.fromName}</span>
              <span className="text-slate-500">pays</span>
              <span className="font-medium text-slate-900">{d.toName}</span>
              <span className="ml-auto font-semibold text-slate-700">{formatCurrency(d.amount, active.currency)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

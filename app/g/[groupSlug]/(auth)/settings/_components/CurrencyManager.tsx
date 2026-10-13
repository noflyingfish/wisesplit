"use client";

import { useState } from "react";
import { Trash2, Plus, Coins } from "lucide-react";
import { addCurrency, deleteCurrency } from "@/app/g/[groupSlug]/(auth)/settings/_actions";
import { availableCurrencyCodes } from "@/lib/currencies";

type Currency = { id: string; code: string; inUse: boolean; isDefault: boolean };

export function CurrencyManager({ groupSlug, currencies }: { groupSlug: string; currencies: Currency[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Codes already added are hidden from the dropdown (rule: the add picker offers
  // only what the group does not already have). The server refuses a duplicate too,
  // so this is a convenience, not the guard.
  const available = availableCurrencyCodes(currencies.map((c) => c.code));
  const [code, setCode] = useState<string>(available[0] ?? "");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!code) { setError("Choose a currency to add"); return; }
    setAdding(true);
    const formData = new FormData();
    formData.append("code", code);
    // `finally` so a rejected action cannot leave the control on "Adding...".
    try {
      const result = await addCurrency(groupSlug, formData);
      if (result?.error) { setError(result.error); } else { setShowAdd(false); setCode(""); }
    } catch {
      setError("Could not add the currency because of a server error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(currency: Currency) {
    setError(null);
    setDeletingId(currency.id);
    try {
      const result = await deleteCurrency(groupSlug, currency.id);
      if (result?.error) setError(result.error);
    } catch {
      setError("Could not delete the currency because of a server error. Please try again.");
    } finally {
      // Without `finally` a rejected delete leaves that row's button disabled for the
      // rest of the page's life.
      setDeletingId(null);
    }
  }

  return (
    <div className="divide-y divide-slate-100">
      {currencies.map((c) => {
        const locked = c.isDefault || c.inUse;
        return (
          <div key={c.id} className="px-5 py-3 flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-700 tracking-wide">{c.code}</span>
            {c.isDefault && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700">
                Default
              </span>
            )}
            {c.inUse && !c.isDefault && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-500">
                In use
              </span>
            )}
            <button
              onClick={() => handleDelete(c)}
              disabled={locked || deletingId === c.id}
              title={
                c.isDefault
                  ? "The default currency cannot be deleted"
                  : c.inUse
                    ? "This currency is used by an expense or settlement and cannot be deleted"
                    : `Delete ${c.code}`
              }
              className="ml-auto p-1.5 text-slate-500 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}

      {currencies.length === 0 && !showAdd && (
        <div className="px-5 py-8 text-center">
          <Coins size={24} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No currencies yet</p>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="px-5 py-4 bg-slate-50/50 space-y-3">
          {error && <p role="alert" className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <select
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700"
            >
              {available.length === 0 ? (
                <option value="">All currencies added</option>
              ) : (
                available.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))
              )}
            </select>
            <button type="submit" disabled={adding || available.length === 0}
              className="px-4 py-2 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors">
              {adding ? "Adding..." : "Add"}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setError(null); }}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {/* The error banner is shown here as well so a delete failure (an in-use
          currency the button's disabled state did not anticipate) is visible when
          the add form is closed. */}
      {!showAdd && error && (
        <p role="alert" className="px-5 py-3 bg-rose-50 border-t border-rose-100 text-xs text-rose-700">{error}</p>
      )}

      {!showAdd && (
        <button onClick={() => { setShowAdd(true); setError(null); }}
          disabled={available.length === 0}
          className="w-full px-5 py-3.5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-500">
          <Plus size={16} />Add Currency
        </button>
      )}
    </div>
  );
}

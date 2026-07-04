"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { createSettlement } from "@/app/g/[groupSlug]/(auth)/settle/_actions";
import { formatCurrency } from "@/lib/utils";

type Member = { id: string; name: string };
type DebtSuggestion = { fromId: string; fromName: string; toId: string; toName: string; amount: number };

export function SettleForm({ groupSlug, members, currentMemberId, suggestions }: { groupSlug: string; members: Member[]; currentMemberId: string; suggestions: DebtSuggestion[] }) {
  const router = useRouter();
  const [paidById, setPaidById] = useState(currentMemberId);
  const [receivedById, setReceivedById] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = parseFloat(amount);
    if (!paidById || !receivedById) { setError("Select both people"); return; }
    if (paidById === receivedById) { setError("Cannot settle with yourself"); return; }
    if (!amountNum || amountNum <= 0) { setError("Amount must be positive"); return; }

    setSubmitting(true);
    const formData = new FormData();
    formData.append("paidById", paidById);
    formData.append("receivedById", receivedById);
    formData.append("amount", amountNum.toString());
    const result = await createSettlement(groupSlug, formData);
    setSubmitting(false);
    if (result.error) { setError(result.error); } else { router.push(`/g/${groupSlug}/balances`); router.refresh(); }
  }

  function applySuggestion(s: DebtSuggestion) { setPaidById(s.fromId); setReceivedById(s.toId); setAmount(s.amount.toString()); }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link href={`/g/${groupSlug}/balances`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft size={16} /> Back</Link>
      <h2 className="text-lg font-bold text-slate-900">Settle Up</h2>
      {error && <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{error}</div>}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Suggested</p>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button key={i} type="button" onClick={() => applySuggestion(s)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors text-left">
                <span className="font-medium text-sm text-slate-700">{s.fromName}{s.fromId === currentMemberId ? " (you)" : ""}</span>
                <ArrowRight size={14} className="text-slate-300" />
                <span className="font-medium text-sm text-slate-700">{s.toName}{s.toId === currentMemberId ? " (you)" : ""}</span>
                <span className="ml-auto font-semibold text-sm text-emerald-600">{formatCurrency(s.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Who paid</label>
        <select value={paidById} onChange={(e) => setPaidById(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
          <option value="">Select...</option>
          {members.map((m) => (<option key={m.id} value={m.id}>{m.name}{m.id === currentMemberId ? " (you)" : ""}</option>))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Who received</label>
        <select value={receivedById} onChange={(e) => setReceivedById(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
          <option value="">Select...</option>
          {members.map((m) => (<option key={m.id} value={m.id}>{m.name}{m.id === currentMemberId ? " (you)" : ""}</option>))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Amount</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
          <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required
            className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
        </div>
      </div>

      <button type="submit" disabled={submitting}
        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm">
        {submitting ? "Saving..." : "Record Settlement"}
      </button>
    </form>
  );
}

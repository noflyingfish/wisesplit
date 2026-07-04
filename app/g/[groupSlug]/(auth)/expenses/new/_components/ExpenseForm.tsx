"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createExpense, updateExpense } from "@/app/g/[groupSlug]/(auth)/expenses/_actions";
import Link from "next/link";

type Member = { id: string; name: string };
type Category = { id: string; emoji: string; name: string };

type EditExpense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  paidById: string;
  categoryId: string | null;
  splitType: "equal" | "unequal";
  shares: { memberId: string; amount: number }[];
};

export function ExpenseForm({ groupSlug, members, categories, editExpense }: { groupSlug: string; members: Member[]; categories: Category[]; editExpense?: EditExpense }) {
  const router = useRouter();
  const todayStr = new Date().toISOString().split("T")[0];
  const [description, setDescription] = useState(editExpense?.description ?? "");
  const [amount, setAmount] = useState(editExpense ? String(editExpense.amount) : "");
  const [date, setDate] = useState(editExpense?.date ?? todayStr);
  const [paidById, setPaidById] = useState(editExpense?.paidById ?? members[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(editExpense?.categoryId ?? "");
  const [splitType, setSplitType] = useState<"equal" | "unequal" | "percentage">(editExpense?.splitType ?? "equal");
  const [involvedIds, setInvolvedIds] = useState<string[]>(
    editExpense && editExpense.splitType === "equal"
      ? editExpense.shares.map((s) => s.memberId)
      : members.map((m) => m.id)
  );
  const [shares, setShares] = useState<{ memberId: string; amount: string }[]>(
    editExpense && editExpense.splitType === "unequal"
      ? members.map((m) => {
          const share = editExpense.shares.find((s) => s.memberId === m.id);
          return { memberId: m.id, amount: share ? String(share.amount) : "" };
        })
      : members.map((m) => ({ memberId: m.id, amount: "" }))
  );
  const [percentages, setPercentages] = useState<{ memberId: string; pct: string }[]>(
    members.map((m) => ({ memberId: m.id, pct: "" }))
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleInvolved = useCallback((memberId: string) => {
    setInvolvedIds((prev) => prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]);
  }, []);

  const updateUnequalShare = useCallback((memberId: string, value: string) => {
    setShares((prev) => prev.map((s) => s.memberId === memberId ? { ...s, amount: value } : s));
  }, []);

  const updatePercentage = useCallback((memberId: string, value: string) => {
    // Allow empty string, or integer 0-100
    if (value !== "" && (!/^\d+$/.test(value) || parseInt(value) > 100)) return;
    setPercentages((prev) => prev.map((p) => p.memberId === memberId ? { ...p, pct: value } : p));
  }, []);

  const handleSplitTypeChange = useCallback((type: "equal" | "unequal" | "percentage") => {
    setSplitType(type);
    // Reset state for the new mode
    if (type === "equal") {
      setInvolvedIds(members.map((m) => m.id));
    } else if (type === "unequal") {
      setShares(members.map((m) => ({ memberId: m.id, amount: "" })));
    } else {
      setPercentages(members.map((m) => ({ memberId: m.id, pct: "" })));
    }
  }, [members]);

  const amountNum = parseFloat(amount) || 0;
  const pctTotal = percentages.reduce((sum, p) => sum + (parseInt(p.pct) || 0), 0);
  const pctBalanced = pctTotal === 100;
  const hasPositivePct = pctTotal > 0;
  const shareTotal = splitType === "percentage" ? 0 : (splitType === "equal" ? amountNum : shares.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0));
  const isBalanced = splitType === "percentage" ? pctBalanced : Math.abs(shareTotal - amountNum) < 0.02;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) { setError("Please enter a description"); return; }
    if (!amountNum || amountNum <= 0) { setError("Please enter a valid amount"); return; }
    if (!date) { setError("Please select a date"); return; }
    if (!paidById) { setError("Please select who paid"); return; }
    if (splitType === "equal" && involvedIds.length === 0) { setError("Select at least one person to split with"); return; }
    if (splitType === "unequal" && !isBalanced) { setError(`Shares must add up to ${amountNum.toFixed(2)}`); return; }
    if (splitType === "percentage" && !pctBalanced) { setError("Percentages must add up to 100%"); return; }
    if (splitType === "percentage" && !hasPositivePct) { setError("At least one member must have a percentage above 0%"); return; }

    setSubmitting(true);
    const formData = new FormData();
    formData.append("description", description);
    formData.append("amount", amountNum.toString());
    formData.append("date", date);
    formData.append("paidById", paidById);
    formData.append("categoryId", categoryId);
    formData.append("splitType", splitType);
    formData.append("shares", JSON.stringify(
      splitType === "equal"
        ? involvedIds
        : splitType === "percentage"
        ? percentages.filter((p) => parseInt(p.pct) > 0).map((p) => ({ memberId: p.memberId, percentage: parseInt(p.pct) }))
        : shares.filter((s) => parseFloat(s.amount) > 0).map((s) => ({ memberId: s.memberId, amount: parseFloat(s.amount) }))
    ));

    const result = editExpense
      ? await updateExpense(groupSlug, editExpense.id, formData)
      : await createExpense(groupSlug, formData);
    setSubmitting(false);
    if (result.error) { setError(result.error); } else { router.push(`/g/${groupSlug}/expenses`); router.refresh(); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Link href={`/g/${groupSlug}/expenses`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft size={16} /> Back</Link>
      <h2 className="text-lg font-bold text-slate-900">{editExpense ? "Edit Expense" : "New Expense"}</h2>
      {error && <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{error}</div>}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner at Luigi&apos;s" required
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required
              className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Paid by</label>
          <select value={paidById} onChange={(e) => setPaidById(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
            {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Category</label>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setCategoryId("")}
            className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${!categoryId ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>None</button>
          {categories.map((cat) => (
            <button key={cat.id} type="button" onClick={() => setCategoryId(cat.id)}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${categoryId === cat.id ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {cat.emoji} {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Split</label>
        <div className="flex gap-2">
          {(["equal", "unequal", "percentage"] as const).map((type) => (
            <button key={type} type="button" onClick={() => handleSplitTypeChange(type)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors capitalize ${splitType === type ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{type}</button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {members.map((m) => {
            const isInvolved = splitType === "equal" ? involvedIds.includes(m.id)
              : splitType === "percentage" ? (parseInt(percentages.find((p) => p.memberId === m.id)?.pct || "0") || 0) > 0
              : (parseFloat(shares.find((s) => s.memberId === m.id)?.amount || "0") || 0) > 0;
            const equalShare = involvedIds.length > 0 ? amountNum / involvedIds.length : 0;
            const memberPct = parseInt(percentages.find((p) => p.memberId === m.id)?.pct || "0") || 0;
            const pctDollarAmount = pctBalanced && amountNum > 0 ? memberPct / 100 * amountNum : 0;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                {splitType === "equal" ? (
                  <button type="button" onClick={() => toggleInvolved(m.id)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isInvolved ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`}>
                    {isInvolved && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                ) : null}
                <span className="flex-1 text-sm font-medium text-slate-700">{m.name}</span>
                {splitType === "equal" ? (
                  <span className="text-sm text-slate-400">{isInvolved && amountNum ? `$${equalShare.toFixed(2)}` : "—"}</span>
                ) : splitType === "percentage" ? (
                  <div className="flex items-center gap-2">
                    {pctBalanced && amountNum > 0 && (
                      <span className="text-xs text-slate-400">${pctDollarAmount.toFixed(2)}</span>
                    )}
                    <div className="relative">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={percentages.find((p) => p.memberId === m.id)?.pct || ""}
                        onChange={(e) => updatePercentage(m.id, e.target.value)} placeholder="0"
                        className="w-20 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">%</span>
                    </div>
                  </div>
                ) : (
                  <input type="number" step="0.01" min="0" value={shares.find((s) => s.memberId === m.id)?.amount || ""}
                    onChange={(e) => updateUnequalShare(m.id, e.target.value)} placeholder="0.00"
                    className="w-24 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
                )}
              </div>
            );
          })}
          {splitType === "unequal" && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">Total</span>
              <span className={`text-sm font-bold ${isBalanced ? "text-emerald-600" : "text-rose-600"}`}>
                ${shareTotal.toFixed(2)}
                {!isBalanced && amountNum > 0 && <span className="text-xs font-normal ml-1">(should be ${amountNum.toFixed(2)})</span>}
              </span>
            </div>
          )}
          {splitType === "percentage" && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">Total</span>
              <span className={`text-sm font-bold ${pctBalanced ? "text-emerald-600" : "text-rose-600"}`}>
                {pctTotal}%
                {!pctBalanced && amountNum > 0 && <span className="text-xs font-normal ml-1">(should be 100%)</span>}
              </span>
            </div>
          )}
        </div>
      </div>

      <button type="submit" disabled={submitting || (splitType === "unequal" && !isBalanced && amountNum > 0) || (splitType === "percentage" && !pctBalanced && amountNum > 0)}
        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm">
        {submitting ? "Saving..." : editExpense ? "Update Expense" : "Save Expense"}
      </button>
    </form>
  );
}

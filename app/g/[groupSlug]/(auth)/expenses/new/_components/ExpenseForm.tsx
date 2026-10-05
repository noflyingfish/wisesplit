"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { createExpense, updateExpense } from "@/app/g/[groupSlug]/(auth)/expenses/_actions";
import { todayISODate } from "@/lib/utils";
import type { SplitType } from "@/lib/expense-shares";
import Link from "next/link";

type Member = { id: string; name: string };
type Category = { id: string; emoji: string; name: string };

/** A typed decimal as `digits × 10^-scale`, or `null` if it is not one. */
function decimalParts(value: string): { digits: bigint; scale: number } | null {
  const text = value.trim();
  if (!/^\d*(?:\.\d*)?$/.test(text)) return null;
  const [intPart = "", fracPart = ""] = text.split(".");
  if (intPart === "" && fracPart === "") return null;
  return { digits: BigInt((intPart || "0") + fracPart), scale: fracPart.length };
}

function timesPowerOfTen(digits: bigint, from: number, to: number): bigint {
  // `BigInt(...)`, not a `10n` literal: the project's `tsconfig` targets ES2017 and
  // BigInt *literals* are a syntax error below ES2020 (the constructor is not).
  return digits * BigInt(10) ** BigInt(to - from);
}

/**
 * True when the typed shares sum to **exactly** the typed amount.
 *
 * This is the client half of `SUM-004`: it replaces
 * `Math.abs(shareTotal - amountNum) < 0.02`, whose 0.02 tolerance called
 * 3.33 + 3.33 + 3.33 against 10.00 "balanced" — a one-cent shortfall the server
 * now refuses, so it enabled a Save button that could not succeed.
 *
 * Two things it deliberately is NOT:
 *
 *   - not a float `===`. `3.333 + 3.333 + 3.334 === 10` happens to be true in V8
 *     today and `0.1 + 0.2 === 0.3` is false, so equality on binary doubles is a
 *     coincidence, not an algorithm. The values are summed as integers scaled to a
 *     common power of ten, which is exactly what the server's `Decimal` does.
 *   - not rounded to cents first. Rounding each share to cents makes
 *     3.333 / 3.333 / 3.334 sum to 9.99 and would disable Save for the split the
 *     SERVER is meant to refuse *with a visible message* — a share with a third
 *     decimal place is the server's rule to enforce (it knows the column's scale),
 *     and a disabled button would put that message out of the user's reach.
 *
 * Deliberately local: `lib/money.ts` imports the Prisma runtime and is server-only,
 * so a client component cannot use `Decimal` here.
 */
function sharesSumToAmount(shareValues: string[], amount: string): boolean {
  const amountParts = decimalParts(amount);
  if (!amountParts) return false;
  const parts = shareValues.map(decimalParts);
  if (parts.some((p) => p === null)) return false;
  const scale = Math.max(amountParts.scale, ...parts.map((p) => (p as { scale: number }).scale));
  const total = (parts as { digits: bigint; scale: number }[]).reduce(
    (acc, p) => acc + timesPowerOfTen(p.digits, p.scale, scale),
    BigInt(0)
  );
  return total === timesPowerOfTen(amountParts.digits, amountParts.scale, scale);
}

/**
 * True when a REJECTED Server-Action call was in fact a **success**.
 *
 * `redirect()` inside a Server Action is delivered to the caller as a rejection of the
 * action's promise, not as a resolution — measured on 2026-09-30 with a real browser
 * against Next 16.2.9, in `next dev --webpack` and in `next build` + `next start`
 * alike:
 *
 *   success            → REJECTS   Error("NEXT_REDIRECT")
 *                                  digest "NEXT_REDIRECT;push;/g/<slug>/expenses;307;",
 *                                  handled: true; and the POST response was
 *                                  HTTP 303 with `x-action-redirect: …/expenses;push`
 *   POST never arrives → REJECTS   TypeError("Failed to fetch") — no `digest`
 *   server error reply → RESOLVES  { error: "…" }
 *
 * That is why the two interesting failures could not be told apart before: they are
 * both rejections, and a bare `.catch(() => undefined)` collapsed them into the same
 * `undefined`. They ARE distinguishable — by the rejection's `digest`, which is the
 * documented contract ("Invoking the `redirect()` function throws a `NEXT_REDIRECT`
 * error", node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md)
 * and exactly what Next.js's own `isRedirectError` tests.
 */
function isRedirectRejection(reason: unknown): boolean {
  if (typeof reason !== "object" || reason === null) return false;
  const digest = (reason as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** The POST produced no answer — a dropped connection, airplane mode, a proxy refusing
 *  the request.
 *
 *  It must NOT claim nothing was written. A rejection here only means the *client* never
 *  heard back: the request may have reached the server and written the row before the
 *  connection dropped, in which case "nothing was saved" would be a plain untruth and
 *  the retry it invites would create a duplicate expense. The wording therefore reports
 *  what is actually known (unconfirmed, possibly not recorded) and sends the user to the
 *  expense list, mirroring `UNCONFIRMED_MESSAGE` below. */
const SERVER_UNREACHABLE_MESSAGE =
  "Lost the connection before the save was confirmed, so it may not have been recorded. Check the expense list before trying again.";

/** The action returned without an error *and* without redirecting. These actions only
 *  ever do one of those two things, so this is unreachable in practice — but a result
 *  that reports nothing is not a result that reports success, and the whole point of
 *  `NF-BB2-1` is that an unconfirmed write must not be dressed up as a saved one. */
const UNCONFIRMED_MESSAGE =
  "The server did not confirm the save, so it may not have been recorded. Check the expense list before trying again.";

type EditExpense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  paidById: string;
  categoryId: string | null;
  splitType: SplitType;
  shares: { memberId: string; amount: number }[];
  /** The stored percentages, for a "percentage" expense only. */
  percentages: { memberId: string; percentage: number }[] | null;
};

export function ExpenseForm({ groupSlug, members, categories, editExpense, defaultDate, currentMemberId }: { groupSlug: string; members: Member[]; categories: Category[]; editExpense?: EditExpense; defaultDate?: string; currentMemberId?: string }) {
  const isEdit = Boolean(editExpense);
  const [description, setDescription] = useState(editExpense?.description ?? "");
  const [amount, setAmount] = useState(editExpense ? String(editExpense.amount) : "");
  // Seeded from the server's date so the SSR markup and the first client render agree
  // (a mismatch here would be a hydration error). The effect below immediately
  // re-derives it in the *browser's* timezone, which is the one the user means.
  const [date, setDate] = useState(editExpense?.date ?? defaultDate ?? "");
  // An edit must keep the payer the expense was STORED with, so `editExpense.paidById`
  // wins outright. A new expense defaults to the signed-in member: the person adding
  // the expense is normally the one who paid, this is a closed `<select>` near the top
  // of the form, and a wrong default is silent and permanent — it is written to the
  // row and every balance downstream is computed from it.
  //
  // `members[0]` survives only as a fallback (absent/stale cookie whose id is not in
  // this group's member list) so the select never renders empty.
  const defaultPayerId =
    editExpense?.paidById ??
    (currentMemberId && members.some((m) => m.id === currentMemberId)
      ? currentMemberId
      : members[0]?.id ?? "");
  const [paidById, setPaidById] = useState(defaultPayerId);
  const [categoryId, setCategoryId] = useState(editExpense?.categoryId ?? "");
  const [splitType, setSplitType] = useState<SplitType>(editExpense?.splitType ?? "equal");
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
  // Restored from the stored percentages on a percentage edit. Seeding these from the
  // stored *dollar* shares instead would show 600/400 for a 60/40 split and, after
  // rounding, could total 99% or 101% — which disables the Save button.
  const seededPercentages: { memberId: string; percentage: number }[] =
    editExpense?.splitType === "percentage" ? editExpense.percentages ?? [] : [];
  const [percentages, setPercentages] = useState<{ memberId: string; pct: string }[]>(
    members.map((m) => {
      const p = seededPercentages.find((x) => x.memberId === m.id);
      return { memberId: m.id, pct: p ? String(p.percentage) : "" };
    })
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  // Idempotency guard. A ref, not state, because state updates are async: a second
  // click landing before re-render would still see `submitting === false` and write a
  // duplicate expense (the exact reaction "looks like nothing happened" invites).
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!isEdit) setDate(todayISODate());
  }, [isEdit]);

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

  // The unequal split is judged by exact equality, matching the balance half of
  // `resolveShares` (server) — which replaced its own `greaterThan(0.02)` tolerance
  // with `explicitTotal.equals(total)` for `SUM-004`. A tolerance here and exactness
  // there is the two halves disagreeing: the old `< 0.02` called
  // 3.33 + 3.33 + 3.33 against 10.00 balanced and enabled Save for a split the server
  // now refuses.
  //
  // The same set of shares is judged as is submitted — the same `> 0` filter the
  // payload below uses — so a blank row cannot make the button disagree with the
  // request. Each value is normalised through `Number`, because that is exactly what
  // crosses the wire (`parseFloat`) before the server turns it into a `Decimal` with
  // `String(value)`: a typed "+3.33" or "1e3" is therefore compared as the 3.33 / 1000
  // the server will actually see, not rejected for its spelling.
  const submittedShares = shares
    .filter((s) => parseFloat(s.amount) > 0)
    .map((s) => String(parseFloat(s.amount)));

  const isBalanced =
    splitType === "percentage"
      ? pctBalanced
      : splitType === "unequal"
        ? sharesSumToAmount(submittedShares, amountNum.toString())
        : true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittedRef.current) return;
    setError(null);
    if (!description.trim()) { setError("Please enter a description"); return; }
    if (!amountNum || amountNum <= 0) { setError("Please enter a valid amount"); return; }
    if (!date) { setError("Please select a date"); return; }
    if (!paidById) { setError("Please select who paid"); return; }
    if (splitType === "equal" && involvedIds.length === 0) { setError("Select at least one person to split with"); return; }
    // The same balance rule the Save button uses. Only the balance: a share with a
    // third decimal place is the SERVER's rule (see `sharesSumToAmount`), and it must
    // be able to refuse it with its own message rather than be pre-empted here.
    if (splitType === "unequal" && !isBalanced) { setError(`Shares must add up to ${amountNum.toFixed(2)}`); return; }
    if (splitType === "percentage" && !pctBalanced) { setError("Percentages must add up to 100%"); return; }
    if (splitType === "percentage" && !hasPositivePct) { setError("At least one member must have a percentage above 0%"); return; }

    submittedRef.current = true;
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

    // On success the action itself redirects to the expense list — it is not this
    // component's job to navigate, because a client-side push issued here was lost on
    // 7 of 8 measured attempts. That redirect arrives as a REJECTION (see
    // `isRedirectRejection`), so what this call does on success and what it does when
    // the request never arrives have to be told apart explicitly. A bare
    // `.catch(() => undefined)` did the opposite: it erased the difference, and the
    // fall-through below then reported "Saved" for an expense that was never written
    // (`NF-BB2-1` — a green confirmation on a disabled button, zero rows, no way to
    // retry without reloading).
    let result: { error?: string; success?: boolean };
    try {
      result = await (editExpense
        ? updateExpense(groupSlug, editExpense.id, formData)
        : createExpense(groupSlug, formData));
    } catch (reason) {
      if (!isRedirectRejection(reason)) {
        // The POST never produced an answer from the server. Nothing was written, so
        // this must not read as a confirmation — and the guard has to be released, or
        // the disabled button would make retry impossible on this very page.
        submittedRef.current = false;
        setSubmitting(false);
        setError(SERVER_UNREACHABLE_MESSAGE);
        return;
      }
      // A redirect means the action ran to completion and the row was written. Keep
      // the button pinned on "Saved" so a second click cannot write a duplicate
      // expense while the server-driven navigation is in flight. This is the guard
      // that NF-BB2-1's sibling defect added; it stays.
      setSubmitting(false);
      setSaved(true);
      return;
    }

    if (result?.error) {
      // A real failure — release the guard so the user can fix the input and retry.
      submittedRef.current = false;
      setSubmitting(false);
      setError(result.error);
      return;
    }

    // Resolved without an error. These actions either return `{ error }` or redirect,
    // so this is unreachable — and an empty result is not a confirmation that a write
    // happened. Do not guess "Saved": release the guard and let the user decide.
    submittedRef.current = false;
    setSubmitting(false);
    setError(UNCONFIRMED_MESSAGE);
  }

  return (
    // `noValidate` switches off the browser's native bubble so the app's own rose
    // banner is the single source of truth. Without it the `required` attributes
    // fire first and every branch in `handleSubmit` below is unreachable: clearing
    // the date showed "Please fill out this field." and the app's "Please select a
    // date" could never appear.
    //
    // The `required` attributes stay exactly as they were — they still describe each
    // field to assistive technology and to the constraint-validation API. Nothing is
    // unprotected: `handleSubmit` rejects a missing description, a missing/non-positive
    // amount, a missing date, and a missing payer, which is everything the native
    // attributes covered and more (split balance, at least one person involved, at
    // least one non-zero percentage).
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <Link href={`/g/${groupSlug}/expenses`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft size={16} /> Back</Link>
      <h2 className="text-lg font-bold text-slate-900">{editExpense ? "Edit Expense" : "New Expense"}</h2>
      {error && <div role="alert" className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{error}</div>}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner at Luigi&apos;s" required
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-all" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-all" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required
              className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-all" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Paid by</label>
          <select value={paidById} onChange={(e) => setPaidById(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-all">
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
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isInvolved ? "bg-emerald-700 border-emerald-700 text-white" : "border-slate-300"}`}>
                    {isInvolved && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                ) : null}
                <span className="flex-1 text-sm font-medium text-slate-700">{m.name}</span>
                {splitType === "equal" ? (
                  <span className="text-sm text-slate-500">{isInvolved && amountNum ? `$${equalShare.toFixed(2)}` : "—"}</span>
                ) : splitType === "percentage" ? (
                  <div className="flex items-center gap-2">
                    {pctBalanced && amountNum > 0 && (
                      <span className="text-xs text-slate-500">${pctDollarAmount.toFixed(2)}</span>
                    )}
                    <div className="relative">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={percentages.find((p) => p.memberId === m.id)?.pct || ""}
                        onChange={(e) => updatePercentage(m.id, e.target.value)} placeholder="0"
                        className="w-20 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">%</span>
                    </div>
                  </div>
                ) : (
                  <input type="number" step="0.01" min="0" value={shares.find((s) => s.memberId === m.id)?.amount || ""}
                    onChange={(e) => updateUnequalShare(m.id, e.target.value)} placeholder="0.00"
                    className="w-24 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700" />
                )}
              </div>
            );
          })}
          {splitType === "unequal" && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">Total</span>
              <span className={`text-sm font-bold ${isBalanced ? "text-emerald-700" : "text-rose-700"}`}>
                ${shareTotal.toFixed(2)}
                {!isBalanced && amountNum > 0 && <span className="text-xs font-normal ml-1">(should be ${amountNum.toFixed(2)})</span>}
              </span>
            </div>
          )}
          {splitType === "percentage" && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">Total</span>
              <span className={`text-sm font-bold ${pctBalanced ? "text-emerald-700" : "text-rose-700"}`}>
                {pctTotal}%
                {!pctBalanced && amountNum > 0 && <span className="text-xs font-normal ml-1">(should be 100%)</span>}
              </span>
            </div>
          )}
        </div>
      </div>

      <button type="submit" disabled={submitting || saved || (splitType === "unequal" && !isBalanced && amountNum > 0) || (splitType === "percentage" && !pctBalanced && amountNum > 0)}
        className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm">
        {saved ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Check size={18} />
            Saved
          </span>
        ) : submitting ? (
          "Saving..."
        ) : editExpense ? (
          "Update Expense"
        ) : (
          "Save Expense"
        )}
      </button>
    </form>
  );
}

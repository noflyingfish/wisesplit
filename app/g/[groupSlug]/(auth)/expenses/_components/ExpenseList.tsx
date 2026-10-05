"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { deleteExpense } from "@/app/g/[groupSlug]/(auth)/expenses/_actions";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Expense, GroupMember, Category } from "@prisma/client";

/**
 * The rows this client component is given.
 *
 * Every money field is a plain `number`, never Prisma's `Decimal`. A `Decimal` is a
 * class instance, and React refuses those outright across the server -> client
 * boundary ("Only plain objects can be passed to Client Components from Server
 * Components. Decimal objects are not supported") — so a `Decimal` left in a prop is
 * not a type nit, it is a runtime error. `percentage` is part of the shape for that
 * reason: listing it forces it to be converted instead of riding along in a spread.
 */
export type ExpenseRow = Omit<Expense, "amount" | "shares"> & {
  amount: number;
  paidBy: GroupMember;
  shares: { memberId: string; amount: number; percentage: number | null; member: GroupMember }[];
  category: Category | null;
};

type Member = { id: string; name: string };

export function ExpenseList({
  expenses, groupSlug, currentMemberId, members,
}: {
  expenses: ExpenseRow[];
  groupSlug: string;
  currentMemberId: string;
  members: Member[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleDelete(expenseId: string) {
    setDeletingId(expenseId);
    const result = await deleteExpense(groupSlug, expenseId);
    if (result.error) alert(result.error);
    setDeletingId(null);
  }

  if (expenses.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-slate-500 font-medium">No expenses yet</p>
        <p className="text-sm text-slate-500 mt-1">Add your first expense to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {expenses.map((expense) => {
        const isExpanded = expandedId === expense.id;
        const yourShare = expense.shares.find((s) => s.memberId === currentMemberId);

        return (
          <div key={expense.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <button onClick={() => { setExpandedId(isExpanded ? null : expense.id); setConfirmDeleteId(null); }}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors">
              <span className="text-xl flex-shrink-0">{expense.category?.emoji ?? "💰"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{expense.description}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {expense.paidBy.name} paid · {expense.paidById === currentMemberId ? "You paid" : yourShare ? `You owe ${formatCurrency(yourShare.amount)}` : "Not involved"}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(expense.amount)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{formatDate(expense.date)}</p>
              </div>
              {isExpanded ? <ChevronUp size={16} className="text-slate-500 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-500 flex-shrink-0" />}
            </button>
            {isExpanded && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
                {/* The collapsed row truncates the description (`nowrap` + `ellipsis`), so
                    without this the expanded card never reveals the rest of it — the text
                    is clipped in both states. Re-rendered here unwrapped so the card
                    actually shows what it is a card for. */}
                <p className="text-sm font-medium text-slate-900 break-words mb-3">{expense.description}</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Split breakdown</p>
                <div className="space-y-2">
                  {expense.shares.map((share) => (
                    <div key={share.memberId} className="flex items-center justify-between text-sm">
                      <span className={share.memberId === currentMemberId ? "font-semibold text-slate-900" : "text-slate-600"}>
                        {share.member.name}{share.memberId === currentMemberId ? " (you)" : ""}
                      </span>
                      <span className={`font-medium ${share.memberId === currentMemberId ? "text-rose-700" : "text-slate-700"}`}>
                        {formatCurrency(share.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
                  {confirmDeleteId === expense.id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-rose-700 font-medium">Are you sure? This cannot be undone.</span>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors">
                        Cancel
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }}
                        disabled={deletingId === expense.id}
                        className="px-2 py-1 text-xs font-medium text-white bg-rose-700 hover:bg-rose-800 rounded-md transition-colors disabled:opacity-50">
                        {deletingId === expense.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ) : (
                    <div />
                  )}
                  <div className="flex items-center gap-1">
                    <Link href={`/g/${groupSlug}/expenses/${expense.id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
                      <Pencil size={12} />Edit
                    </Link>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(expense.id); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 size={12} />Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

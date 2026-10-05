import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { toNumber } from "@/lib/money";
import { ExpenseList } from "./_components/ExpenseList";

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupSlug: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { groupSlug } = await params;
  const { category } = await searchParams;
  const memberCookie = await getMemberCookie();

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    include: { categories: true, members: true },
  });

  if (!group || !memberCookie) return null;

  const expenses = await db.expense.findMany({
    where: { groupId: group.id, ...(category ? { categoryId: category } : {}) },
    include: { paidBy: true, shares: { include: { member: true } }, category: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  // Convert the money columns to plain numbers as they leave the server. `ExpenseList`
  // is a client component, and React rejects a `Decimal` (a class instance) crossing
  // that boundary outright. Mapped field by field rather than spread-and-override: a
  // spread carries `ExpenseShare.percentage` — also a `Decimal` — along with it, which
  // is exactly how this leaked a "Decimal objects are not supported" error.
  const expenseRows = expenses.map((e) => ({
    ...e,
    amount: toNumber(e.amount),
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      amount: toNumber(s.amount),
      percentage: s.percentage === null ? null : toNumber(s.percentage),
      member: s.member,
    })),
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Link href={`/g/${groupSlug}/expenses`}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${!category ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          All
        </Link>
        {group.categories.map((cat) => (
          <Link key={cat.id} href={`/g/${groupSlug}/expenses?category=${cat.id}`}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${category === cat.id ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {cat.emoji} {cat.name}
          </Link>
        ))}
      </div>
      <ExpenseList expenses={expenseRows} groupSlug={groupSlug}
        currentMemberId={memberCookie.memberId} members={group.members} />

      <Link href={`/g/${groupSlug}/expenses/new`}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-40">
        <Plus size={24} />
      </Link>
    </div>
  );
}

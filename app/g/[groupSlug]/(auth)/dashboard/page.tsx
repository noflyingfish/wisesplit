import Link from "next/link";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { DEFAULT_CURRENCY_CODE } from "@/lib/currencies";
import { Card } from "@/components/Card";
import { CurrencySummary } from "./_components/CurrencySummary";
import { Plus } from "lucide-react";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const memberCookie = await getMemberCookie();

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    include: { members: true },
  });

  if (!group || !memberCookie) return null;

  const { currencies } = await computeBalances(group.id);

  // One pre-computed block per currency for the toggle. Currencies with no activity
  // are dropped, except the default (SGD) which is always present so a blank group
  // still shows its zeroed tiles and the toggle always has a default to open on.
  // Nothing is ever summed across currencies — each block is this member's own
  // figures in one currency.
  const me = memberCookie.memberId;
  const summary = currencies
    .filter((c) => c.hasActivity || c.currency === DEFAULT_CURRENCY_CODE)
    .map((c) => {
      const oweSum = c.simplifiedDebts.filter((d) => d.fromId === me).reduce((s, d) => s + d.amount, 0);
      const owedSum = c.simplifiedDebts.filter((d) => d.toId === me).reduce((s, d) => s + d.amount, 0);
      return { currency: c.currency, oweSum, owedSum, net: owedSum - oweSum, debts: c.simplifiedDebts };
    });

  const recentExpenses = await db.expense.findMany({
    where: { groupId: group.id },
    include: { paidBy: true, shares: true, category: true, currency: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 5,
  });

  const recentSettlements = await db.settlement.findMany({
    where: { groupId: group.id },
    include: { paidBy: true, receivedBy: true, currency: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  interface ActivityItem {
    type: "expense" | "settlement";
    title: string;
    subtitle: string;
    youTag: string;
    emoji: string;
    time: Date;
  }

  const activities: ActivityItem[] = [
    ...recentExpenses.map((e) => {
      const yourShare = e.shares.find((s) => s.memberId === memberCookie.memberId);
      return {
        type: "expense" as const,
        title: e.description,
        subtitle: `${e.paidBy.name} paid ${formatCurrency(e.amount, e.currency.code)} · split ${e.shares.length} ways`,
        youTag: yourShare ? `You owe ${formatCurrency(yourShare.amount, e.currency.code)}` : "Not involved",
        emoji: e.category?.emoji ?? "💰",
        time: e.date,
      };
    }),
    ...recentSettlements.map((s) => {
      const isPayer = s.paidById === memberCookie.memberId;
      const isReceiver = s.receivedById === memberCookie.memberId;
      return {
        type: "settlement" as const,
        title: "Settlement",
        subtitle: `${s.paidBy.name} paid ${s.receivedBy.name} ${formatCurrency(s.amount, s.currency.code)}`,
        youTag: isPayer
          ? `You paid ${formatCurrency(s.amount, s.currency.code)}`
          : isReceiver
            ? `You received ${formatCurrency(s.amount, s.currency.code)}`
            : "",
        emoji: "💰",
        time: s.createdAt,
      };
    }),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <CurrencySummary summaries={summary} />

      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Activity</h2>
        {activities.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-3xl mb-3">🧾</div>
            <p className="text-slate-500 mb-4">No activity yet</p>
            <Link href={`/g/${groupSlug}/expenses/new`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white font-medium rounded-xl hover:bg-emerald-800 transition-colors">
              <Plus size={16} />Add your first expense
            </Link>
          </Card>
        ) : (
          <Card className="divide-y divide-slate-100">
            {activities.map((a, i) => (
              <div key={i} className="px-5 py-4 flex items-start gap-3">
                <span className="text-xl mt-0.5">{a.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{a.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{a.subtitle}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {a.youTag && <p className="text-xs font-medium text-slate-700">{a.youTag}</p>}
                  <p className="text-xs text-slate-500 mt-0.5">{timeAgo(a.time)}</p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Link href={`/g/${groupSlug}/expenses/new`}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-40">
        <Plus size={24} />
      </Link>
    </div>
  );
}

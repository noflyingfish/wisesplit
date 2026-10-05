import Link from "next/link";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";
import { formatCurrency, timeAgo } from "@/lib/utils";
import { Card } from "@/components/Card";
import { ArrowDownRight, ArrowUpRight, Minus, Plus } from "lucide-react";

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

  const { simplifiedDebts } = await computeBalances(group.id);

  const youOwe = simplifiedDebts.filter((d) => d.fromId === memberCookie.memberId);
  const owedToYou = simplifiedDebts.filter((d) => d.toId === memberCookie.memberId);
  const oweSum = youOwe.reduce((s, d) => s + d.amount, 0);
  const owedSum = owedToYou.reduce((s, d) => s + d.amount, 0);
  const net = owedSum - oweSum;

  const recentExpenses = await db.expense.findMany({
    where: { groupId: group.id },
    include: { paidBy: true, shares: true, category: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 5,
  });

  const recentSettlements = await db.settlement.findMany({
    where: { groupId: group.id },
    include: { paidBy: true, receivedBy: true },
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
        subtitle: `${e.paidBy.name} paid ${formatCurrency(e.amount)} · split ${e.shares.length} ways`,
        youTag: yourShare ? `You owe ${formatCurrency(yourShare.amount)}` : "Not involved",
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
        subtitle: `${s.paidBy.name} paid ${s.receivedBy.name} ${formatCurrency(s.amount)}`,
        youTag: isPayer
          ? `You paid ${formatCurrency(s.amount)}`
          : isReceiver
            ? `You received ${formatCurrency(s.amount)}`
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
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <ArrowDownRight size={16} className="text-rose-500" />You owe
          </div>
          <p className="text-xl font-bold text-rose-700">{formatCurrency(oweSum)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <ArrowUpRight size={16} className="text-emerald-700" />You&apos;re owed
          </div>
          <p className="text-xl font-bold text-emerald-700">{formatCurrency(owedSum)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Minus size={16} className="text-slate-500" />Net
          </div>
          <p className={`text-xl font-bold ${net > 0 ? "text-emerald-700" : net < 0 ? "text-rose-700" : "text-slate-600"}`}>
            {formatCurrency(net)}
          </p>
        </Card>
      </div>

      {simplifiedDebts.length > 0 && (
        <Card className="divide-y divide-slate-100">
          <div className="px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Simplified Debts</h2>
          </div>
          {simplifiedDebts.map((d, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3 text-sm">
              <span className="font-medium text-slate-900">{d.fromName}</span>
              <span className="text-slate-500">pays</span>
              <span className="font-medium text-slate-900">{d.toName}</span>
              <span className="ml-auto font-semibold text-slate-700">{formatCurrency(d.amount)}</span>
            </div>
          ))}
        </Card>
      )}

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

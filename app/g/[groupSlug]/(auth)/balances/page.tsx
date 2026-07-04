import Link from "next/link";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/Card";
import { ArrowRight, Plus, Wallet } from "lucide-react";

export default async function BalancesPage({
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

  const { members, simplifiedDebts } = await computeBalances(group.id);
  const maxNet = Math.max(...members.map((x) => Math.abs(x.net)), 1);

  return (
    <div className="space-y-6">
      <Card>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Who Pays Whom</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {simplifiedDebts.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <p className="text-slate-500 font-medium">All settled up!</p>
              <p className="text-sm text-slate-400 mt-1">No one owes anyone anything</p>
            </div>
          ) : (
            simplifiedDebts.map((d, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-3">
                <span className={`font-medium text-sm ${d.fromId === memberCookie.memberId ? "text-rose-600" : "text-slate-700"}`}>
                  {d.fromName}{d.fromId === memberCookie.memberId ? " (you)" : ""}
                </span>
                <ArrowRight size={16} className="text-slate-300 flex-shrink-0" />
                <span className={`font-medium text-sm ${d.toId === memberCookie.memberId ? "text-emerald-600" : "text-slate-700"}`}>
                  {d.toName}{d.toId === memberCookie.memberId ? " (you)" : ""}
                </span>
                <span className="ml-auto font-semibold text-sm text-slate-900">{formatCurrency(d.amount)}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">All Members</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {members.sort((a, b) => b.net - a.net).map((m) => {
            const isMe = m.memberId === memberCookie.memberId;
            return (
              <div key={m.memberId} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-medium ${isMe ? "text-emerald-600" : "text-slate-700"}`}>
                    {m.memberName}{isMe ? " (you)" : ""}
                  </span>
                  <span className={`text-sm font-semibold ${m.net > 0.01 ? "text-emerald-600" : m.net < -0.01 ? "text-rose-600" : "text-slate-400"}`}>
                    {m.net > 0.01 ? `+${formatCurrency(m.net)}` : formatCurrency(m.net)}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${m.net >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                    style={{ width: `${(Math.abs(m.net) / maxNet) * 100}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-400">Paid {formatCurrency(m.paid)}</span>
                  <span className="text-xs text-slate-400">Owes {formatCurrency(m.owes)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Link href={`/g/${groupSlug}/settle/new`}
        className="flex items-center justify-center gap-2 w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm">
        <Wallet size={18} />Settle Up
      </Link>

      <Link href={`/g/${groupSlug}/expenses/new`}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-40">
        <Plus size={24} />
      </Link>
    </div>
  );
}

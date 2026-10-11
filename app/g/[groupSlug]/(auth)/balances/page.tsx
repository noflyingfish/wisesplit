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

  const { currencies } = await computeBalances(group.id);
  // One card per currency that has activity (an expense or a settlement); a
  // currency with none is hidden rather than shown empty. Order is SGD first, then
  // alphabetical (computeBalances already sorted it).
  const active = currencies.filter((c) => c.hasActivity);

  return (
    <div className="space-y-6">
      {active.length === 0 ? (
        // No activity at all in any currency — a group with nothing recorded must
        // still say so rather than render a blank page.
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Who Pays Whom</h2>
          </div>
          <div className="px-5 py-8 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-slate-500 font-medium">All settled up!</p>
            <p className="text-sm text-slate-500 mt-1">No one owes anyone anything</p>
          </div>
        </Card>
      ) : (
        active.map((c) => (
          <Card key={c.currency}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Who Pays Whom ({c.currency})</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {c.simplifiedDebts.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <div className="text-3xl mb-2">🎉</div>
                  <p className="text-slate-500 font-medium">All settled up!</p>
                  <p className="text-sm text-slate-500 mt-1">No one owes anyone anything</p>
                </div>
              ) : (
                c.simplifiedDebts.map((d, i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-3">
                    <span className={`font-medium text-sm ${d.fromId === memberCookie.memberId ? "text-rose-700" : "text-slate-700"}`}>
                      {d.fromName}{d.fromId === memberCookie.memberId ? " (you)" : ""}
                    </span>
                    <ArrowRight size={16} className="text-slate-300 flex-shrink-0" />
                    <span className={`font-medium text-sm ${d.toId === memberCookie.memberId ? "text-emerald-700" : "text-slate-700"}`}>
                      {d.toName}{d.toId === memberCookie.memberId ? " (you)" : ""}
                    </span>
                    <span className="ml-auto font-semibold text-sm text-slate-900">{formatCurrency(d.amount, c.currency)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        ))
      )}

      <Link href={`/g/${groupSlug}/settle/new`}
        className="flex items-center justify-center gap-2 w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm">
        <Wallet size={18} />Settle Up
      </Link>

      <Link href={`/g/${groupSlug}/expenses/new`}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-40">
        <Plus size={24} />
      </Link>
    </div>
  );
}

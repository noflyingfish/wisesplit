import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { Card } from "@/components/Card";
import { MemberManager } from "./_components/MemberManager";
import { CategoryManager } from "./_components/CategoryManager";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const memberCookie = await getMemberCookie();

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    include: { members: { orderBy: { createdAt: "asc" } }, categories: { orderBy: { name: "asc" } } },
  });

  if (!group || !memberCookie) return null;

  // The floating "+" is fixed to the bottom-right corner (`bottom-6 right-6`), so at
  // 375 px it floats over the right ~80 px of the column. Every card here is a list of
  // rows whose action button is right-aligned straight into that band — the category
  // trash sat under the FAB (measured: `elementFromPoint` at its centre returned the
  // FAB, and its box intersected the FAB's by 26x22 px). Reserving that band as a
  // trailing gutter on the cards keeps every row control outside the FAB's footprint.
  // `pr` on the rows would not do it: the `w-full` "Add …" rows are full-bleed boxes,
  // so only shrinking the card itself clears them.
  //
  // `max-lg:` because the clearance is only owed where the FAB can actually reach the
  // column. The card's right edge is `(vw + 672)/2 - 16` and the FAB's left edge is
  // `vw - 80`, so the two stop touching at vw ≈ 800 px; at 1024 px and up the FAB is
  // far outside the centred column and the cards go back to the full width the other
  // three tabs use. The 768 px tablet case still overlaps by 16 px, and `max-lg`
  // covers it.
  return (
    <div className="space-y-6">
      <Card className="max-lg:mr-16">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Members ({group.members.length})</h2>
        </div>
        <MemberManager groupSlug={groupSlug}
          members={group.members.map((m) => ({ id: m.id, name: m.name, token: m.token }))}
          currentMemberId={memberCookie.memberId} />
      </Card>

      <Card className="max-lg:mr-16">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Categories ({group.categories.length})</h2>
        </div>
        <CategoryManager groupSlug={groupSlug}
          categories={group.categories.map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }))} />
      </Card>

      <Link href={`/g/${groupSlug}/expenses/new`}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-40">
        <Plus size={24} />
      </Link>
    </div>
  );
}

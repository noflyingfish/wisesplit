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

  return (
    <div className="space-y-6">
      <Card>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Members ({group.members.length})</h2>
        </div>
        <MemberManager groupSlug={groupSlug}
          members={group.members.map((m) => ({ id: m.id, name: m.name, token: m.token }))}
          currentMemberId={memberCookie.memberId} />
      </Card>

      <Card>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Categories ({group.categories.length})</h2>
        </div>
        <CategoryManager groupSlug={groupSlug}
          categories={group.categories.map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }))} />
      </Card>

      <Link href={`/g/${groupSlug}/expenses/new`}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-200 flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-40">
        <Plus size={24} />
      </Link>
    </div>
  );
}

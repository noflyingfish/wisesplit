import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";
import { SettleForm } from "./_components/SettleForm";

export default async function NewSettlePage({
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

  return (
    <SettleForm
      groupSlug={groupSlug}
      members={group.members.map((m) => ({ id: m.id, name: m.name }))}
      currentMemberId={memberCookie.memberId}
      suggestions={simplifiedDebts}
    />
  );
}

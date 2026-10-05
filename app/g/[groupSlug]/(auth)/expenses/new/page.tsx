import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { todayISODate } from "@/lib/utils";
import { ExpenseForm } from "./_components/ExpenseForm";

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const memberCookie = await getMemberCookie();

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    include: { members: true, categories: true },
  });

  if (!group || !memberCookie) return null;

  return (
    <ExpenseForm
      groupSlug={groupSlug}
      members={group.members.map((m) => ({ id: m.id, name: m.name }))}
      categories={group.categories.map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }))}
      defaultDate={todayISODate()}
      // The signed-in member, so a NEW expense defaults its payer to the person
      // adding it instead of whichever member happens to sort first (`NF-B4D-1`).
      currentMemberId={memberCookie.memberId}
    />
  );
}

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { ExpenseForm } from "../../new/_components/ExpenseForm";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupSlug: string; expenseId: string }>;
}) {
  const { groupSlug, expenseId } = await params;
  const memberCookie = await getMemberCookie();

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    include: { members: true, categories: true },
  });

  if (!group || !memberCookie) return null;

  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    include: { shares: true },
  });

  if (!expense || expense.groupId !== group.id) {
    notFound();
  }

  // Determine split type from shares
  const shareAmounts = expense.shares.map((s) => s.amount);
  const allEqual =
    shareAmounts.length > 0 &&
    shareAmounts.every((a) => Math.abs(a - shareAmounts[0]) < 0.02);

  return (
    <ExpenseForm
      groupSlug={groupSlug}
      members={group.members.map((m) => ({ id: m.id, name: m.name }))}
      categories={group.categories.map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }))}
      editExpense={{
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        date: expense.date.toISOString().split("T")[0],
        paidById: expense.paidById,
        categoryId: expense.categoryId,
        splitType: allEqual ? "equal" : "unequal",
        shares: expense.shares.map((s) => ({ memberId: s.memberId, amount: s.amount })),
      }}
    />
  );
}

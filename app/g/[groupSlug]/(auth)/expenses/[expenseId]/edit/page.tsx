import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { storedDateToInputValue } from "@/lib/utils";
import { isSplitType, type SplitType } from "@/lib/expense-shares";
import { isDecimal, toNumber } from "@/lib/money";
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

  // Prefer the split type the user actually chose.
  const storedType: SplitType | null = isSplitType(expense.splitType) ? expense.splitType : null;

  // Fallback for rows written before `Expense.splitType` existed, where the type is
  // genuinely unrecoverable: the stored dollar shares cannot distinguish a 60/40
  // percentage split (600/400) from an unequal one, nor an even percentage split from
  // an equal one. This is the same heuristic the page used unconditionally before.
  //
  // The comparison is `Decimal`, not float. `share.amount` comes back from a
  // DECIMAL(12,2) column as a `Decimal`, and `Math.abs(a - b)` on two objects is
  // `NaN` — which compares false against everything, so every row would have been
  // declared "not equal" and reopened as "Unequal".
  const shareAmounts = expense.shares.map((s) => s.amount);
  const allEqual =
    shareAmounts.length > 0 &&
    shareAmounts.every((a) => shareAmounts[0].minus(a).abs().lessThan(0.02));
  const legacyType: SplitType = allEqual ? "equal" : "unequal";

  // A percentage expense additionally needs the percentages themselves — the dollar
  // amounts cannot be inverted back to them faithfully (rounding can land on 99% or
  // 101%, which would leave the form unable to save). Only fall back if a percentage
  // row is somehow missing them.
  //
  // This used to read `typeof s.percentage === "number"`, which a `Decimal` never
  // satisfies — it is an object. So the test answered "not stored" for rows where the
  // percentages WERE stored, dropped them, and silently reopened a percentage expense
  // as "Unequal". Nothing threw and nothing logged: the only visible symptom was the
  // form quietly disagreeing with what the user had entered, which is exactly the
  // S-2 defect this column was added to fix.
  const storedPercentages =
    expense.shares.length > 0 && expense.shares.every((s) => isDecimal(s.percentage))
      ? expense.shares.map((s) => ({
          memberId: s.memberId,
          percentage: toNumber(s.percentage),
        }))
      : null;

  const splitType: SplitType =
    storedType === "percentage" && !storedPercentages ? legacyType : storedType ?? legacyType;

  return (
    <ExpenseForm
      groupSlug={groupSlug}
      members={group.members.map((m) => ({ id: m.id, name: m.name }))}
      categories={group.categories.map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }))}
      // Passed for the same reason as the new-expense page. On an edit it changes
      // nothing: `editExpense.paidById` takes precedence, so the stored payer is
      // shown unchanged.
      currentMemberId={memberCookie.memberId}
      editExpense={{
        id: expense.id,
        description: expense.description,
        // Converted here, at the server -> client boundary: a `Decimal` handed to a
        // client component is serialised into a STRING ("12.34"), and the form does
        // arithmetic on these values.
        amount: toNumber(expense.amount),
        date: storedDateToInputValue(expense.date),
        paidById: expense.paidById,
        categoryId: expense.categoryId,
        splitType,
        shares: expense.shares.map((s) => ({ memberId: s.memberId, amount: toNumber(s.amount) })),
        percentages: splitType === "percentage" ? storedPercentages : null,
      }}
    />
  );
}

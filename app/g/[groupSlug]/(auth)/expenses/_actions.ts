"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { isSplitType, resolveShares, type ResolvedShare } from "@/lib/expense-shares";
import { toDecimal, type Money } from "@/lib/money";
import { textLengthError } from "@/lib/text-limits";

/**
 * Validates the shared fields and turns the user's split input into shares.
 * Returns either an error to show or the shares to write.
 */
function parseExpenseForm(
  formData: FormData
): { error: string } | { amount: Money; paidById: string; date: Date; categoryId: string; description: string; splitType: "equal" | "unequal" | "percentage"; shares: ResolvedShare[] } {
  const description = formData.get("description") as string;
  const rawAmount = formData.get("amount") as string;
  const amount = parseFloat(rawAmount);
  const paidById = formData.get("paidById") as string;
  const categoryId = formData.get("categoryId") as string;
  const dateStr = formData.get("date") as string;
  const splitType = formData.get("splitType");

  if (!description?.trim()) return { error: "Description is required" };
  // `Expense.description` is `varchar(191)`. Checked here so it covers BOTH
  // `createExpense` and `updateExpense`, which is the whole point of this function
  // returning the parsed shape rather than each caller validating for itself.
  const descriptionError = textLengthError(description, "Description");
  if (descriptionError) return { error: descriptionError };
  // `parseFloat` validity is unchanged, so the accepted inputs are exactly what they
  // were before the column became DECIMAL. What changes is what happens next: the
  // amount is converted to an exact `Decimal` rather than kept as a float, which is
  // what the money columns now store.
  if (isNaN(amount) || amount <= 0) return { error: "Amount must be positive" };
  if (!paidById) return { error: "Payer is required" };
  if (!dateStr?.trim()) return { error: "Date is required" };
  if (!isSplitType(splitType)) return { error: "Unknown split type" };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: "Invalid date" };

  const resolved = resolveShares(amount, splitType, formData.get("shares"));
  if ("error" in resolved) return { error: resolved.error };

  return {
    amount: toDecimal(amount),
    paidById,
    date,
    categoryId,
    description,
    splitType,
    shares: resolved.shares,
  };
}

export async function createExpense(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  const parsed = parseExpenseForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { amount, paidById, date, categoryId, description, splitType, shares } = parsed;

  try {
    await db.expense.create({
      data: {
        description: description.trim(),
        amount,
        date,
        // Persisted so the edit page can reopen what the user chose. Without it the
        // split type is guessed back from the share amounts, which cannot tell a
        // 60/40 percentage split from a 600/400 unequal one.
        splitType,
        paidBy: { connect: { id: paidById } },
        group: { connect: { slug: groupSlug } },
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
        shares: {
          create: shares.map((s) => ({
            member: { connect: { id: s.memberId } },
            amount: s.amount,
            percentage: s.percentage,
          })),
        },
      },
    });
  } catch (error) {
    console.error(`Failed to create expense in group "${groupSlug}":`, error);
    return {
      error: "Could not save the expense because of a server error. Please try again.",
    };
  }

  revalidatePath(`/g/${groupSlug}/dashboard`);
  revalidatePath(`/g/${groupSlug}/expenses`);
  revalidatePath(`/g/${groupSlug}/balances`);

  // Navigate from the *server*, as part of this action's own response.
  //
  // Measured, not assumed: when the client issued `router.push()` itself after
  // awaiting this action, the navigation was lost on 7 of 8 attempts - the row was
  // written, no error surfaced, and the user was left on a filled-in form (the
  // natural reaction being to press Save again). Calling `router.refresh()` in the
  // same tick was NOT the cause; removing it changed nothing (still 1/8). A redirect
  // returned with the action response cannot race the revalidated tree the way a
  // separate client-side navigation can.
  //
  // MUST stay outside the try/catch above: `redirect()` signals by throwing, and a
  // catch-all would swallow it and report a spurious error.
  redirect(`/g/${groupSlug}/expenses`);
}

export async function updateExpense(
  groupSlug: string,
  expenseId: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  const parsed = parseExpenseForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { amount, paidById, date, categoryId, description, splitType, shares } = parsed;

  try {
    await db.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          description: description.trim(),
          amount,
          date,
          splitType,
          paidBy: { connect: { id: paidById } },
          ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
          shares: {
            create: shares.map((s) => ({
              member: { connect: { id: s.memberId } },
              amount: s.amount,
              percentage: s.percentage,
            })),
          },
        },
      });
    });
  } catch (error) {
    console.error(`Failed to update expense ${expenseId} in group "${groupSlug}":`, error);
    return {
      error: "Could not save your changes because of a server error. Please try again.",
    };
  }

  revalidatePath(`/g/${groupSlug}/dashboard`);
  revalidatePath(`/g/${groupSlug}/expenses`);
  revalidatePath(`/g/${groupSlug}/balances`);

  // Server-side redirect for the same reason as `createExpense` - see the comment there.
  redirect(`/g/${groupSlug}/expenses`);
}

export async function deleteExpense(
  groupSlug: string,
  expenseId: string
): Promise<{ error?: string; success?: boolean }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  try {
    await db.expense.delete({ where: { id: expenseId } });
    revalidatePath(`/g/${groupSlug}/dashboard`);
    revalidatePath(`/g/${groupSlug}/expenses`);
    revalidatePath(`/g/${groupSlug}/balances`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete expense:", error);
    return { error: "Failed to delete expense" };
  }
}

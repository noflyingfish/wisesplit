"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";

export async function createExpense(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  const description = formData.get("description") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const paidById = formData.get("paidById") as string;
  const categoryId = formData.get("categoryId") as string;
  const dateStr = formData.get("date") as string;
  const splitType = formData.get("splitType") as string;
  const sharesData = formData.get("shares") as string;

  if (!description?.trim()) return { error: "Description is required" };
  if (isNaN(amount) || amount <= 0) return { error: "Amount must be positive" };
  if (!paidById) return { error: "Payer is required" };
  if (!dateStr?.trim()) return { error: "Date is required" };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: "Invalid date" };

  let shares: { memberId: string; amount: number }[];

  if (splitType === "equal") {
    const involvedIds = sharesData ? JSON.parse(sharesData) : [];
    if (involvedIds.length === 0) return { error: "Select at least one member to split with" };
    const shareAmount = Math.round((amount / involvedIds.length) * 100) / 100;
    shares = involvedIds.map((id: string, i: number) => ({
      memberId: id,
      amount: i === 0
        ? Math.round((amount - shareAmount * (involvedIds.length - 1)) * 100) / 100
        : shareAmount,
    }));
  } else if (splitType === "percentage") {
    const pctShares: { memberId: string; percentage: number }[] = sharesData ? JSON.parse(sharesData) : [];
    if (pctShares.length === 0) return { error: "No percentage shares provided" };

    // Validate all percentages are non-negative integers
    for (const s of pctShares) {
      if (!Number.isInteger(s.percentage) || s.percentage < 0 || s.percentage > 100) {
        return { error: "Percentages must be whole numbers between 0 and 100" };
      }
    }

    const totalPct = pctShares.reduce((sum: number, s: { percentage: number }) => sum + s.percentage, 0);
    if (totalPct !== 100) {
      return { error: `Percentages must total 100% (currently ${totalPct}%)` };
    }

    // Calculate dollar amounts from percentages
    const rawShares = pctShares.map((s) => ({
      memberId: s.memberId,
      amount: Math.round((amount * s.percentage / 100) * 100) / 100,
    }));

    // Absorb rounding remainder into first member
    const rawTotal = rawShares.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0);
    const remainder = Math.round((amount - rawTotal) * 100) / 100;
    shares = rawShares.map((s, i) => ({
      memberId: s.memberId,
      amount: i === 0 ? Math.round((s.amount + remainder) * 100) / 100 : s.amount,
    }));
  } else {
    shares = sharesData ? JSON.parse(sharesData) : [];
    if (shares.length === 0) return { error: "No shares provided" };
    const total = shares.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0);
    if (Math.abs(total - amount) > 0.02) {
      return { error: `Shares total (${total}) must equal amount (${amount})` };
    }
  }

  try {
    await db.expense.create({
      data: {
        description: description.trim(),
        amount,
        date,
        paidBy: { connect: { id: paidById } },
        group: { connect: { slug: groupSlug } },
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
        shares: { create: shares.map((s) => ({ member: { connect: { id: s.memberId } }, amount: s.amount })) },
      },
    });

    revalidatePath(`/g/${groupSlug}/dashboard`);
    revalidatePath(`/g/${groupSlug}/expenses`);
    revalidatePath(`/g/${groupSlug}/balances`);
    return { success: true };
  } catch (error) {
    console.error("Failed to create expense:", error);
    return { error: "Failed to create expense" };
  }
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

  const description = formData.get("description") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const paidById = formData.get("paidById") as string;
  const categoryId = formData.get("categoryId") as string;
  const dateStr = formData.get("date") as string;
  const splitType = formData.get("splitType") as string;
  const sharesData = formData.get("shares") as string;

  if (!description?.trim()) return { error: "Description is required" };
  if (isNaN(amount) || amount <= 0) return { error: "Amount must be positive" };
  if (!paidById) return { error: "Payer is required" };
  if (!dateStr?.trim()) return { error: "Date is required" };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: "Invalid date" };

  let shares: { memberId: string; amount: number }[];

  if (splitType === "equal") {
    const involvedIds = sharesData ? JSON.parse(sharesData) : [];
    if (involvedIds.length === 0) return { error: "Select at least one member to split with" };
    const shareAmount = Math.round((amount / involvedIds.length) * 100) / 100;
    shares = involvedIds.map((id: string, i: number) => ({
      memberId: id,
      amount: i === 0
        ? Math.round((amount - shareAmount * (involvedIds.length - 1)) * 100) / 100
        : shareAmount,
    }));
  } else if (splitType === "percentage") {
    const pctShares: { memberId: string; percentage: number }[] = sharesData ? JSON.parse(sharesData) : [];
    if (pctShares.length === 0) return { error: "No percentage shares provided" };

    for (const s of pctShares) {
      if (!Number.isInteger(s.percentage) || s.percentage < 0 || s.percentage > 100) {
        return { error: "Percentages must be whole numbers between 0 and 100" };
      }
    }

    const totalPct = pctShares.reduce((sum: number, s: { percentage: number }) => sum + s.percentage, 0);
    if (totalPct !== 100) {
      return { error: `Percentages must total 100% (currently ${totalPct}%)` };
    }

    const rawShares = pctShares.map((s) => ({
      memberId: s.memberId,
      amount: Math.round((amount * s.percentage / 100) * 100) / 100,
    }));

    const rawTotal = rawShares.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0);
    const remainder = Math.round((amount - rawTotal) * 100) / 100;
    shares = rawShares.map((s, i) => ({
      memberId: s.memberId,
      amount: i === 0 ? Math.round((s.amount + remainder) * 100) / 100 : s.amount,
    }));
  } else {
    shares = sharesData ? JSON.parse(sharesData) : [];
    if (shares.length === 0) return { error: "No shares provided" };
    const total = shares.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0);
    if (Math.abs(total - amount) > 0.02) {
      return { error: `Shares total (${total}) must equal amount (${amount})` };
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          description: description.trim(),
          amount,
          date,
          paidBy: { connect: { id: paidById } },
          ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
          shares: { create: shares.map((s) => ({ member: { connect: { id: s.memberId } }, amount: s.amount })) },
        },
      });
    });

    revalidatePath(`/g/${groupSlug}/dashboard`);
    revalidatePath(`/g/${groupSlug}/expenses`);
    revalidatePath(`/g/${groupSlug}/balances`);
    return { success: true };
  } catch (error) {
    console.error("Failed to update expense:", error);
    return { error: "Failed to update expense" };
  }
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

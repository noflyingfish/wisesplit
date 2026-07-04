"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";

export async function createSettlement(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  const paidById = formData.get("paidById") as string;
  const receivedById = formData.get("receivedById") as string;
  const amount = parseFloat(formData.get("amount") as string);

  if (!paidById || !receivedById) return { error: "Select both people" };
  if (paidById === receivedById) return { error: "Cannot settle with yourself" };
  if (isNaN(amount) || amount <= 0) return { error: "Amount must be positive" };

  try {
    await db.settlement.create({
      data: { amount, paidById, receivedById, group: { connect: { slug: groupSlug } } },
    });
    revalidatePath(`/g/${groupSlug}/dashboard`);
    revalidatePath(`/g/${groupSlug}/balances`);
    return { success: true };
  } catch (error) {
    console.error("Failed to create settlement:", error);
    return { error: "Failed to record settlement" };
  }
}

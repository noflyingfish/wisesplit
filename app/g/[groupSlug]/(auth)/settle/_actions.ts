"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { toDecimal } from "@/lib/money";

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

  // Both people must belong to *this* group. Checked here so a bad id produces a
  // clear message instead of a raw foreign-key failure from the database.
  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    select: { id: true, members: { select: { id: true } } },
  });
  if (!group) return { error: "This group no longer exists" };

  const memberIds = new Set(group.members.map((m) => m.id));
  if (!memberIds.has(paidById) || !memberIds.has(receivedById)) {
    return { error: "Both people must be members of this group" };
  }

  try {
    // Relation connects throughout. Mixing Prisma's *unchecked* scalar FKs
    // (`paidById`) with a *checked* relation (`group: { connect }`) is rejected by
    // Prisma with `PrismaClientValidationError: Argument 'paidBy' is missing`.
    // That is how this call failed on 100% of invocations without ever writing a row.
    await db.settlement.create({
      data: {
        // Exact `Decimal`, not the parsed float — the column is DECIMAL(12,2) and a
        // float here is what made 10.05 a coin-flip in the balance maths.
        amount: toDecimal(amount),
        paidBy: { connect: { id: paidById } },
        receivedBy: { connect: { id: receivedById } },
        group: { connect: { slug: groupSlug } },
      },
    });
  } catch (error) {
    // An exception here is an infrastructure/shape failure, NOT bad user input.
    // Log the real cause, and never disguise it as a user error — a swallowed
    // PrismaClientValidationError behind "Failed to record settlement" is exactly
    // how this defect stayed invisible for three QA rounds.
    console.error(`Failed to create settlement in group "${groupSlug}":`, error);
    return {
      error:
        "Could not record the settlement because of a server error. Please try again — if it keeps failing, report it.",
    };
  }

  revalidatePath(`/g/${groupSlug}/dashboard`);
  revalidatePath(`/g/${groupSlug}/balances`);

  // Server-side redirect: navigation is part of this action's own response, so it
  // cannot be lost the way a client-side `router.push()` after an awaited action can
  // (measured: that lost 7 of 8 navigations on the expense form).
  // MUST stay outside the try/catch — `redirect()` signals by throwing.
  redirect(`/g/${groupSlug}/balances`);
}

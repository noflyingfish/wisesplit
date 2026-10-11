"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { generateToken } from "@/lib/utils";
import { textLengthError } from "@/lib/text-limits";
import { DEFAULT_CURRENCY_CODE, isCurrencyCode } from "@/lib/currencies";

/**
 * Every surface a currency change can affect: the settings list, the expense list,
 * the two forms whose currency pickers read the group's currencies, and the
 * dashboard / balances / settle views whose per-currency grouping depends on them.
 */
function revalidateCurrencySurfaces(groupSlug: string) {
  for (const path of ["settings", "expenses", "expenses/new", "dashboard", "balances", "settle/new"]) {
    revalidatePath(`/g/${groupSlug}/${path}`);
  }
}

export async function addMember(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string; token?: string; name?: string }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required" };

  // `GroupMember.name` is `varchar(191)`; refuse before the write so no `P2000` can
  // reach the user (see `lib/text-limits.ts`).
  const nameError = textLengthError(name, "Member name");
  if (nameError) return { error: nameError };

  const group = await db.group.findUnique({ where: { slug: groupSlug } });
  if (!group) return { error: "Group not found" };

  const existing = await db.groupMember.findFirst({ where: { groupId: group.id, name } });
  if (existing) return { error: "A member with this name already exists" };

  const token = generateToken();
  await db.groupMember.create({ data: { name, token, groupId: group.id } });

  revalidatePath(`/g/${groupSlug}/settings`);
  return { token, name };
}

export async function addCategory(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  const emoji = (formData.get("emoji") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  if (!emoji || !name) return { error: "Emoji and name are required" };

  // `Category.name` and `Category.emoji` are both `varchar(191)`. The emoji comes from
  // the form's fixed picker, so it cannot be over-length from the UI today — checked
  // anyway, for the same reason the picker is not trusted: the action is a network
  // endpoint and the server check has to be correct on its own.
  const emojiError = textLengthError(emoji, "Emoji");
  if (emojiError) return { error: emojiError };
  const nameError = textLengthError(name, "Category name");
  if (nameError) return { error: nameError };

  const group = await db.group.findUnique({ where: { slug: groupSlug } });
  if (!group) return { error: "Group not found" };

  const existing = await db.category.findFirst({ where: { groupId: group.id, name } });
  if (existing) return { error: "A category with this name already exists" };

  await db.category.create({ data: { emoji, name, groupId: group.id } });
  revalidatePath(`/g/${groupSlug}/settings`);
  revalidatePath(`/g/${groupSlug}/expenses`);
  return {};
}

export async function deleteCategory(
  groupSlug: string,
  categoryId: string
): Promise<{ error?: string }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  await db.category.delete({ where: { id: categoryId } });
  revalidatePath(`/g/${groupSlug}/settings`);
  revalidatePath(`/g/${groupSlug}/expenses`);
  return {};
}

export async function addCurrency(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  const code = (formData.get("code") as string)?.trim();
  // The dropdown only offers codes from the master list, but the action is a
  // network endpoint — validate the code against the list on its own.
  if (!isCurrencyCode(code)) return { error: "Choose a currency from the list" };

  const group = await db.group.findUnique({ where: { slug: groupSlug } });
  if (!group) return { error: "Group not found" };

  // The server refuses a duplicate. `Currency` also carries UNIQUE(groupId, code)
  // as a backstop, but the message here is the one the user reads.
  const existing = await db.currency.findFirst({ where: { groupId: group.id, code } });
  if (existing) return { error: "That currency is already added" };

  await db.currency.create({ data: { code, groupId: group.id } });
  revalidateCurrencySurfaces(groupSlug);
  return {};
}

export async function deleteCurrency(
  groupSlug: string,
  currencyId: string
): Promise<{ error?: string }> {
  const memberCookie = await getMemberCookie();
  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    return { error: "Not authenticated" };
  }

  // Resolve the group first, and look the currency up WITHIN it, so an id from
  // another group cannot be deleted through this action.
  const group = await db.group.findUnique({ where: { slug: groupSlug }, select: { id: true } });
  if (!group) return { error: "Group not found" };

  const currency = await db.currency.findFirst({
    where: { id: currencyId, groupId: group.id },
  });
  if (!currency) return { error: "Currency not found" };

  // SGD is seeded into every group and is the default everywhere — it can never
  // be removed.
  if (currency.code === DEFAULT_CURRENCY_CODE) {
    return { error: `${DEFAULT_CURRENCY_CODE} is the default currency and cannot be deleted` };
  }

  // "In use" means referenced by an expense OR a settlement — checking only
  // `Expense` (the obvious implementation) would let a currency that only clears a
  // settlement be deleted and orphan that settlement's amount.
  const [expenseCount, settlementCount] = await Promise.all([
    db.expense.count({ where: { currencyId: currency.id } }),
    db.settlement.count({ where: { currencyId: currency.id } }),
  ]);
  if (expenseCount > 0 || settlementCount > 0) {
    return {
      error: `${currency.code} is in use and cannot be deleted. Remove or change the ${expenseCount > 0 ? "expenses" : "settlements"} that use it first.`,
    };
  }

  await db.currency.delete({ where: { id: currency.id } });
  revalidateCurrencySurfaces(groupSlug);
  return {};
}

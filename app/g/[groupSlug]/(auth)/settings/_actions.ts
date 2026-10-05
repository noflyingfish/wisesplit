"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { generateToken } from "@/lib/utils";
import { textLengthError } from "@/lib/text-limits";

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

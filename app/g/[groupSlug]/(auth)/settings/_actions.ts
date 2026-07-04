"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { generateToken } from "@/lib/utils";

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

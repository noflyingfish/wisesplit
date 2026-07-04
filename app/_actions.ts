"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { generateSlug, generateToken } from "@/lib/utils";
import { setMemberCookie } from "@/lib/auth";

export async function createGroup(
  formData: FormData
): Promise<{ error?: string }> {
  const groupName = formData.get("groupName") as string;
  const yourName = formData.get("yourName") as string;

  if (!groupName?.trim() || !yourName?.trim()) {
    return { error: "Please fill in all fields" };
  }

  const slug = generateSlug(groupName);
  const token = generateToken();

  const group = await db.group.create({
    data: {
      name: groupName.trim(),
      slug,
      members: {
        create: {
          name: yourName.trim(),
          token,
        },
      },
      categories: {
        createMany: {
          data: [
            { emoji: "🍕", name: "Food & Drinks" },
            { emoji: "🚗", name: "Transport" },
            { emoji: "🏠", name: "Accommodation" },
            { emoji: "🎉", name: "Entertainment" },
            { emoji: "🛒", name: "Groceries" },
            { emoji: "📦", name: "Other" },
          ],
        },
      },
    },
    include: { members: true },
  });

  const member = group.members[0];

  await setMemberCookie(member.token, {
    groupSlug: slug,
    memberId: member.id,
    memberName: member.name,
  });

  redirect(`/g/${slug}/dashboard`);
}

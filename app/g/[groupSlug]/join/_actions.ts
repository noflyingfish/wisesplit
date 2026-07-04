"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/utils";
import { setMemberCookie } from "@/lib/auth";

export async function joinGroup(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string }> {
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    return { error: "Please enter your name" };
  }

  const group = await db.group.findUnique({ where: { slug: groupSlug } });
  if (!group) {
    return { error: "Group not found" };
  }

  // Check if name already taken in this group
  const existing = await db.groupMember.findFirst({
    where: { groupId: group.id, name },
  });

  if (existing) {
    // Name exists — just set cookie and redirect (they might be re-joining)
    await setMemberCookie(existing.token, {
      groupSlug: groupSlug,
      memberId: existing.id,
      memberName: existing.name,
    });
    redirect(`/g/${groupSlug}/dashboard`);
  }

  const token = generateToken();
  const member = await db.groupMember.create({
    data: {
      name,
      token,
      groupId: group.id,
    },
  });

  await setMemberCookie(member.token, {
    groupSlug: groupSlug,
    memberId: member.id,
    memberName: member.name,
  });

  redirect(`/g/${groupSlug}/dashboard`);
}

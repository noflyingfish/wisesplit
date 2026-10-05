"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/utils";
import { setMemberCookie } from "@/lib/auth";
import { textLengthError } from "@/lib/text-limits";

export async function joinGroup(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string }> {
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    return { error: "Please enter your name" };
  }

  // `GroupMember.name` is `varchar(191)` — refuse before the write (see
  // `lib/text-limits.ts`), so a long name cannot become an uncaught `P2000`.
  const nameError = textLengthError(name, "Your name");
  if (nameError) return { error: nameError };

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

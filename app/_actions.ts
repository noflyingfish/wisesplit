"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { generateSlug, generateToken } from "@/lib/utils";
import { setMemberCookie } from "@/lib/auth";
import { textLengthError } from "@/lib/text-limits";

export async function createGroup(
  formData: FormData
): Promise<{ error?: string }> {
  const groupName = formData.get("groupName") as string;
  const yourName = formData.get("yourName") as string;

  if (!groupName?.trim() || !yourName?.trim()) {
    return { error: "Please fill in all fields" };
  }

  // `Group.name` and `GroupMember.name` are both `varchar(191)`. Checked BEFORE the
  // write: an over-length value used to reach the database, come back as an uncaught
  // Prisma `P2000`, and surface as an HTTP 500 with the submit button stuck on
  // "Creating..." — see `lib/text-limits.ts`. (`groupSlug` is generated and capped
  // at 67 characters by `generateSlug`, so it needs no check of its own.)
  const groupNameError = textLengthError(groupName, "Group name");
  if (groupNameError) return { error: groupNameError };
  const yourNameError = textLengthError(yourName, "Your name");
  if (yourNameError) return { error: yourNameError };

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

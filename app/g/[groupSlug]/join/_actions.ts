"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { setMemberCookie } from "@/lib/auth";

/**
 * Signs an existing member of `groupSlug` in.
 *
 * Identity is CHOSEN at entry and never switched in-app. This action can only ever
 * adopt a member that already exists in the group — it does NOT create one. Membership
 * is created in exactly two places: group creation (`app/_actions.ts`) and
 * Settings → Add Member (`settings/_actions.ts`). This replaces the previous
 * free-text implementation, which matched a name *within* the group and created a new
 * `GroupMember` when nothing matched.
 *
 * SECURITY — the lookup is scoped by `groupId` and never a bare `findUnique({ id })`.
 * The member id arrives from a client-submitted form field, so it is attacker-
 * controlled. The `(auth)` layout and every server action compare only `groupSlug`;
 * none of them re-verify that `memberId` belongs to that group. Scoping the lookup to
 * the group resolved from the URL is what makes another group's member id useless here.
 */
export async function joinGroup(
  groupSlug: string,
  formData: FormData
): Promise<{ error?: string }> {
  const memberId = (formData.get("memberId") as string)?.trim();

  if (!memberId) {
    return { error: "Please select your name" };
  }

  const group = await db.group.findUnique({ where: { slug: groupSlug } });
  if (!group) {
    return { error: "Group not found" };
  }

  // Scoped by `groupId` on purpose — see the SECURITY note above. A member id that
  // belongs to a different group resolves to `null` here and is refused.
  const member = await db.groupMember.findFirst({
    where: { id: memberId, groupId: group.id },
  });

  if (!member) {
    return {
      error: "That name is not in this group. Ask the organiser to add you.",
    };
  }

  // The cookie is built from the DATABASE record, not the submitted values, so a
  // crafted request cannot smuggle a name or id that does not match the stored member.
  await setMemberCookie(member.token, {
    groupSlug: groupSlug,
    memberId: member.id,
    memberName: member.name,
  });

  redirect(`/g/${groupSlug}/dashboard`);
}

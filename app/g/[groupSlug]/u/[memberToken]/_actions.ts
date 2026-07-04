"use server";

import { setMemberCookie } from "@/lib/auth";

export async function loginWithToken(
  memberToken: string,
  groupSlug: string,
  memberId: string,
  memberName: string
) {
  await setMemberCookie(memberToken, {
    groupSlug,
    memberId,
    memberName,
  });
}

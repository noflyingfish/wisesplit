"use server";

import { clearGroupCookies, setMemberCookie } from "@/lib/auth";

export async function loginWithToken(
  memberToken: string,
  groupSlug: string,
  memberId: string,
  memberName: string
) {
  // Clear BEFORE setting: a member link must REPLACE the browser's identity, not add to it.
  //
  // Cookies are named per member (`wisesplit_<memberToken>`) and every one of them is
  // scoped to the same path (`/g/<groupSlug>`). Opening a second member's link without
  // this clear would leave the first cookie in the jar, and `getMemberCookie()` returns
  // the FIRST prefix-matching cookie it sees — the browser sends cookies at one path
  // oldest-first (RFC 6265 §5.4), so the earlier member would win forever and the new
  // one would be written and then ignored (the header would keep naming the old member).
  //
  // Expiring the whole group's set first means at most one member cookie per group ever
  // exists, so that ambiguity cannot arise. Both writes land on this one response, in
  // this order, so the browser applies "expire" then "set".
  //
  // Do not remove this as redundant: `getMemberCookie()`'s first-match rule is still
  // there, and it is the reason a stale sibling cookie is fatal rather than harmless.
  await clearGroupCookies(groupSlug);
  await setMemberCookie(memberToken, {
    groupSlug,
    memberId,
    memberName,
  });
}

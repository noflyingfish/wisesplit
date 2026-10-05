import { cookies } from "next/headers";

export const COOKIE_PREFIX = "wisesplit_";

export type MemberCookie = {
  groupSlug: string;
  memberId: string;
  memberName: string;
};

/**
 * Path a group's member cookie is scoped to.
 *
 * Cookies must be deleted with the *same* path they were set with.
 * `cookieStore.delete(name)` is NOT sufficient here: Next normalises it to an
 * explicit `Path=/`, which never matches a cookie stored at `/g/<slug>`
 * (RFC 6265 §5.3 only substitutes a default path when the attribute is absent).
 * Verified against a real browser cookie jar.
 */
export function memberCookiePath(groupSlug: string): string {
  return `/g/${groupSlug}`;
}

export async function setMemberCookie(memberToken: string, data: MemberCookie) {
  const cookieStore = await cookies();

  // Expire this group's other member cookies *before* writing the new one.
  //
  // Identity is resolved by `getMemberCookie()`, which returns the FIRST
  // prefix-matching cookie, so a leftover cookie for the same group silently wins and
  // "switch member" becomes a no-op. Enforcing the invariant here, rather than at each
  // call site, closes every door at once — `loginWithToken`, `joinGroup` ×2 and
  // `createGroup` — and stops the next writer from reopening the class by forgetting.
  // `clearGroupCookies` only touches cookies at this group's path, so membership in
  // another group is unaffected.
  await clearGroupCookies(data.groupSlug);

  cookieStore.set(`${COOKIE_PREFIX}${memberToken}`, JSON.stringify(data), {
    httpOnly: true,
    sameSite: "lax",
    path: memberCookiePath(data.groupSlug),
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function getMemberCookie(): Promise<MemberCookie | null> {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith(COOKIE_PREFIX)) {
      try {
        return JSON.parse(cookie.value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Clears one member's session cookie.
 *
 * Takes `groupSlug` because the cookie is scoped to `/g/<groupSlug>` and can only
 * be removed by writing a cookie with that exact path. (Deleting the name alone
 * emits `Path=/` and matches nothing — see `memberCookiePath`.)
 */
export async function clearMemberCookie(memberToken: string, groupSlug: string) {
  const cookieStore = await cookies();
  cookieStore.set(`${COOKIE_PREFIX}${memberToken}`, "", {
    path: memberCookiePath(groupSlug),
    maxAge: 0,
  });
}

/**
 * Clears *every* member session cookie for a group — this is what "Leave group" means.
 *
 * `getMemberCookie()` deliberately walks all prefix-matching cookies and returns the
 * first parseable one, so removing only the cookie we happen to recognise would leave
 * the user signed in. Expiring all of them is the correct semantic.
 */
export async function clearGroupCookies(groupSlug: string) {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith(COOKIE_PREFIX)) {
      cookieStore.set(cookie.name, "", {
        path: memberCookiePath(groupSlug),
        maxAge: 0,
      });
    }
  }
}

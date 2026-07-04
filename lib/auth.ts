import { cookies } from "next/headers";
import { createHash } from "crypto";

const COOKIE_PREFIX = "wisesplit_";

export type MemberCookie = {
  groupSlug: string;
  memberId: string;
  memberName: string;
};

export async function setMemberCookie(memberToken: string, data: MemberCookie) {
  const cookieStore = await cookies();
  cookieStore.set(`${COOKIE_PREFIX}${memberToken}`, JSON.stringify(data), {
    httpOnly: true,
    sameSite: "lax",
    path: `/g/${data.groupSlug}`,
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

export async function clearMemberCookie(memberToken: string) {
  const cookieStore = await cookies();
  cookieStore.delete(`${COOKIE_PREFIX}${memberToken}`);
}
